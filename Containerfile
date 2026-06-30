# Stage 1 — build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — serve compiled assets with nginx
FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
