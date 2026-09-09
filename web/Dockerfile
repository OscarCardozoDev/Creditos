FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install

COPY . .

# Se sirve el build, no el servidor de desarrollo: en desarrollo Vite recarga la pagina entera
# cuando pre-empaqueta una dependencia nueva, y esa recarga borra el formulario a medio llenar.
RUN bun run build

EXPOSE 5173

CMD ["bun", "run", "preview", "--host", "--port", "5173"]
