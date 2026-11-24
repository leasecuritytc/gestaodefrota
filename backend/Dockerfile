FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Usuário não-root dentro do container (defesa em profundidade)
RUN addgroup -S gdf && adduser -S gdf -G gdf
USER gdf
EXPOSE 4000
CMD ["node", "dist/index.js"]
