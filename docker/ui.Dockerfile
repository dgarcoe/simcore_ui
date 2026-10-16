FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/ui-entrypoint/40-ollama-proxy.sh /docker-entrypoint.d/
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
