# Etapa de compilacion: necesita las dependencias de desarrollo.
FROM node:22-alpine AS construccion
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Imagen: solo dist/, las dependencias de produccion y lo que el arranque necesita.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=construccion /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
