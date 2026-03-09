import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import https from 'node:https';

function tiledProxyPlugin(): Plugin {
  return {
    name: 'tiled-proxy',
    configureServer(server) {
      server.middlewares.use('/tiled-proxy', (req, res) => {
        // req.url is the path after /tiled-proxy
        // e.g. /http/nefarian.xray.aps.anl.gov:8020/api/v1
        const url = req.url ?? '/';
        const match = url.match(/^\/?([^/]+)\/([^/]+)(\/.*)?$/);
        if (!match) {
          res.writeHead(400);
          res.end('Bad proxy URL — expected /tiled-proxy/<protocol>/<host:port>/...');
          return;
        }

        const protocol = match[1]; // 'http' or 'https'
        const host = match[2];     // 'nefarian.xray.aps.anl.gov:8020'
        const rawPath = match[3] ?? '/';

        // Some Tiled trees don't support sorting — strip the sort param
        const [pathOnly, rawQuery] = rawPath.split('?');
        const params = new URLSearchParams(rawQuery ?? '');
        params.delete('sort');
        const queryStr = params.toString();
        const path = queryStr ? `${pathOnly}?${queryStr}` : pathOnly;

        const [hostname, portStr] = host.split(':');
        const port = portStr ? parseInt(portStr) : (protocol === 'https' ? 443 : 80);

        const transport = protocol === 'https' ? https : http;
        const proxyReqHeaders = { ...req.headers, host };
        delete proxyReqHeaders['accept-encoding']; // get uncompressed so we can rewrite JSON

        const proxyReq = transport.request(
          { hostname, port, path, method: req.method, headers: proxyReqHeaders },
          (proxyRes) => {
            const contentType = proxyRes.headers['content-type'] ?? '';
            const chunks: Buffer[] = [];

            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              let body = Buffer.concat(chunks);

              if (contentType.includes('application/json')) {
                // Rewrite absolute server URLs so subsequent fetches also go through proxy
                const origin = `http://${req.headers.host}`;
                let text = body.toString('utf-8');
                text = text.replaceAll(
                  `${protocol}://${host}`,
                  `${origin}/tiled-proxy/${protocol}/${host}`
                );
                body = Buffer.from(text);
              }

              const headers = { ...proxyRes.headers };
              headers['content-length'] = String(body.length);
              headers['access-control-allow-origin'] = '*';
              delete headers['content-encoding'];

              res.writeHead(proxyRes.statusCode ?? 200, headers);
              res.end(body);
            });
          }
        );

        proxyReq.on('error', (err) => {
          res.writeHead(502);
          res.end(`Proxy error: ${err.message}`);
        });

        req.pipe(proxyReq);
      });
    },
  };
}

function qserverProxyPlugin(): Plugin {
  return {
    name: 'qserver-proxy',
    configureServer(server) {
      // HTTP proxy: /qs-proxy/http/host:port/... → http://host:port/...
      server.middlewares.use('/qs-proxy', (req, res) => {
        const url = req.url ?? '/';
        const match = url.match(/^\/?([^/]+)\/([^/]+)(\/.*)?$/);
        if (!match) {
          res.writeHead(400);
          res.end('Bad proxy URL — expected /qs-proxy/<protocol>/<host:port>/...');
          return;
        }

        const protocol = match[1];
        const host = match[2];
        const path = match[3] ?? '/';
        const [hostname, portStr] = host.split(':');
        const port = portStr ? parseInt(portStr) : (protocol === 'https' ? 443 : 80);

        const transport = protocol === 'https' ? https : http;
        const proxyReqHeaders = { ...req.headers, host };
        delete proxyReqHeaders['accept-encoding'];

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          const proxyReq = transport.request(
            { hostname, port, path, method: req.method, headers: { ...proxyReqHeaders, 'content-length': body.length } },
            (proxyRes) => {
              const headers = { ...proxyRes.headers };
              headers['access-control-allow-origin'] = '*';
              // Node.js decodes chunked/compressed data from the upstream, so
              // forwarding these headers would mislead the browser about the
              // encoding of what it actually receives.
              delete headers['content-encoding'];
              delete headers['transfer-encoding'];
              delete headers['content-length'];
              res.writeHead(proxyRes.statusCode ?? 200, headers);
              // Flush headers immediately so the browser's fetch() resolves
              // without waiting for the first body chunk (streaming endpoints
              // may not send data until a scan starts).
              res.flushHeaders();
              // Disable Nagle's algorithm so each NDJSON line is forwarded
              // immediately rather than batched by TCP.
              res.socket?.setNoDelay(true);
              proxyRes.on('data', (chunk: Buffer) => res.write(chunk));
              proxyRes.on('end', () => res.end());
              proxyRes.on('error', (err: Error) => res.destroy(err));
              req.on('close', () => proxyReq.destroy());
            }
          );
          proxyReq.on('error', (err) => { res.writeHead(502); res.end(`Proxy error: ${err.message}`); });
          proxyReq.end(body);
        });
      });
    },
  };
}

// Dedicated SSE proxy for /api/stream_console_output.
// Converts the upstream NDJSON stream to text/event-stream so that Safari
// (and all other browsers) deliver events incrementally via EventSource.
function qserverSSEPlugin(): Plugin {
  return {
    name: 'qserver-sse',
    configureServer(server) {
      server.middlewares.use('/qs-stream', (req, res) => {
        const url = req.url ?? '/';
        const match = url.match(/^\/?([^/]+)\/([^/]+)(\/.*)?$/);
        if (!match) {
          res.writeHead(400);
          res.end('Bad URL — expected /qs-stream/<protocol>/<host:port>/...');
          return;
        }

        const protocol = match[1];
        const host = match[2];
        // Strip ?api_key=... from the path before forwarding
        const rawPath = match[3] ?? '/';
        const [pathOnly, queryStr] = rawPath.split('?');
        const params = new URLSearchParams(queryStr ?? '');
        const apiKey = params.get('api_key') ?? '';

        const [hostname, portStr] = host.split(':');
        const port = portStr ? parseInt(portStr) : (protocol === 'https' ? 443 : 80);
        const transport = protocol === 'https' ? https : http;

        const upstreamHeaders: Record<string, string> = { host };
        if (apiKey) upstreamHeaders['Authorization'] = `ApiKey ${apiKey}`;

        // Send SSE headers immediately — this is what tells browsers to deliver
        // each event as it arrives rather than buffering the whole response.
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.flushHeaders();
        res.socket?.setNoDelay(true);
        // Initial SSE comment — fires EventSource onopen in the browser.
        res.write(': connected\n\n');

        const proxyReq = transport.request(
          { hostname, port, path: pathOnly, method: 'GET', headers: upstreamHeaders },
          (proxyRes) => {
            let buf = '';
            proxyRes.on('data', (chunk: Buffer) => {
              buf += chunk.toString('utf-8');
              // First pass: emit any newline-terminated NDJSON lines
              const parts = buf.split('\n');
              buf = parts.pop() ?? '';
              for (const part of parts) {
                if (part.trim()) res.write(`data: ${part.trim()}\n\n`);
              }
              // Second pass: if the remainder is a complete JSON object
              // (server sends one object per chunk with no trailing newline),
              // emit and clear the buffer.
              const trimmed = buf.trim();
              if (trimmed.startsWith('{')) {
                try { JSON.parse(trimmed); res.write(`data: ${trimmed}\n\n`); buf = ''; } catch { /* incomplete */ }
              }
            });
            proxyRes.on('end', () => res.end());
            proxyRes.on('error', () => res.end());
          }
        );
        proxyReq.on('error', (err) => { console.error('[qs-stream] error:', err.message); res.end(); });
        req.on('close', () => proxyReq.destroy());
        proxyReq.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tiledProxyPlugin(), qserverProxyPlugin(), qserverSSEPlugin()],
});
