FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY shared shared
COPY client client
RUN npm run build -w @card-table/shared && npm run build -w @card-table/client

FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
# The base image renders /etc/nginx/templates/*.template through envsubst and
# runs /docker-entrypoint.d/*.sh before starting nginx.
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY client/docker-entrypoint.d/10-runtime-config.sh /docker-entrypoint.d/10-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/10-runtime-config.sh
# Overridden by compose; named here so the image runs standalone.
ENV SERVER_UPSTREAM=server:2567
EXPOSE 80
