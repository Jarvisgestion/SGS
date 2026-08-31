# Imagen de la plataforma SGS.
#
# El contexto es la raíz del repositorio, no app/, porque el arranque necesita
# también las migraciones y la semilla que viven en db/.
FROM node:22-slim

WORKDIR /srv

# Dependencias primero: cambian mucho menos que el código.
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci --omit=dev && npm cache clean --force

COPY app ./app
COPY db ./db

# TypeScript solo hace falta para compilar, no para correr.
RUN cd app && npm install --no-save typescript@5.7.2 @types/node@22.10.2 \
      @types/express@4.17.21 @types/pg@8.11.10 \
 && npx tsc -p tsconfig.json \
 && npm prune --omit=dev

ENV NODE_ENV=production
ENV ATTACHMENTS_DIR=/data/attachments
WORKDIR /srv/app

# Prepara la base (migraciones, rol de la aplicación, semilla si está vacía) y
# recién entonces levanta el servidor.
CMD ["sh", "-c", "node dist/scripts/deploy-bootstrap.js && node dist/server.js"]
