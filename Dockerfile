FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --include=optional --os=linux --libc=musl --cpu=x64 --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY seed ./seed
RUN npm run build
RUN npm prune --omit=dev --include=optional

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/seed ./seed
RUN mkdir -p /app/data/images && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["sh", "-c", "node scripts/migrate-legacy-stickers.mjs --manifest /app/seed/legacy/stickers.json --assets-dir /app/seed/legacy/assets --data-dir /app/data --if-empty && node dist/server.js"]
