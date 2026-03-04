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

export default defineConfig({
  plugins: [react(), tiledProxyPlugin()],
});
