# Imagen única: un proceso que sirve la API bajo /api y la aplicación en el
# resto. Mismo origen, sin CORS y con el service worker funcionando.

# --- build de la aplicación ---------------------------------------------------
FROM node:22-slim AS cliente
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

# --- dependencias de la API (sólo producción) ---------------------------------
FROM node:22-slim AS dependencias
WORKDIR /app
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev

# --- imagen final -------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencias /app/api/node_modules ./api/node_modules
COPY api ./api
COPY db ./db
COPY --from=cliente /app/client/dist ./client/dist

# Los adjuntos se guardan acá. Tiene que ser un volumen: si no, se pierden en
# cada despliegue (ver DEPLOY.md).
RUN mkdir -p /app/var/attachments && chown -R node:node /app/var
VOLUME ["/app/var/attachments"]

USER node
EXPOSE 3000

# Las migraciones corren al arrancar: son idempotentes y verifican el checksum,
# así que un despliegue repetido no hace nada.
CMD ["sh", "-c", "node --experimental-strip-types api/src/cli/migrate.ts && node --experimental-strip-types api/src/server.ts"]
