import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// El .env vive en la raíz del proyecto, no en web/: es el mismo que alimenta a docker compose.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// El proxy deja frontend y API en un solo origen, como en producción: evita configurar CORS
// con credenciales (modulos/01_autenticacion_y_sesiones.md §11) y hace que la cookie
// `__Host-` viaje sin ajustes.
export default defineConfig(({ mode }) => {
  // API_PORT_HOST es el puerto en el que la API queda publicada en la máquina anfitriona.
  const env = loadEnv(mode, RAIZ, '')
  // En docker compose API_URL nombra al servicio `api`; fuera, la API esta publicada en el anfitrion.
  const destino = env.API_URL || `http://localhost:${env.API_PORT_HOST || '3000'}`

  const proxy = { '/api': { target: destino, changeOrigin: true } }

  // `preview` sirve el build: es lo que corre dentro de docker compose, y necesita el mismo
  // proxy que `server`, porque la cookie de sesión depende de que haya un solo origen.
  return { plugins: [react(), tailwindcss()], server: { proxy }, preview: { proxy } }
})
