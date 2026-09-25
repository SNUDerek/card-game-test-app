FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY shared shared
COPY server server
RUN npm run build -w @card-table/shared && npm run build -w @card-table/server
RUN npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
EXPOSE 2567
CMD ["node", "server/dist/index.js"]
