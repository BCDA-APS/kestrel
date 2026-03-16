# ---- Build stage ----
FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src

COPY --chown=1001:0 package*.json ./
RUN npm ci

COPY --chown=1001:0 . .
RUN npm run build

# Keep only production deps for runtime
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal
WORKDIR /opt/app-root/src

ENV NODE_ENV=production
ENV PORT=4173

COPY --from=build /opt/app-root/src/package*.json ./
COPY --from=build /opt/app-root/src/server.mjs ./
COPY --from=build /opt/app-root/src/dist ./dist
COPY --from=build /opt/app-root/src/node_modules ./node_modules

USER 1001
EXPOSE 4173
CMD ["node", "server.mjs"]
