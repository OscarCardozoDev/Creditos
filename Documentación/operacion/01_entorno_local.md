# Entorno Local

Cómo levantar el sistema completo en una máquina de desarrollo.

---

## 1. Requisitos

- Docker Desktop con Compose.
- Node.js 20 o superior, si se quiere ejecutar API o frontend fuera de contenedor.

No hace falta instalar SQL Server: corre en contenedor.

---

## 2. Arranque

```bash
git clone <repositorio>
cd <repositorio>
cp .env.example .env      # editar las contraseñas locales
docker compose up --build
```

Al terminar:

| Servicio | Dirección |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api |
| Documentación interactiva | http://localhost:3000/api/docs |
| SQL Server | localhost:1433 |

La API aplica las migraciones al arrancar y carga los datos iniciales si la base está vacía.

---

## 3. Secuencia de arranque

1. Arranca el contenedor de SQL Server.
2. Compose consulta su chequeo de salud (`sqlcmd -Q "SELECT 1"`) hasta que el motor responde.
3. Arranca la API, ya con la base disponible.
4. La API ejecuta `migration:run`.
5. Si la base está vacía, carga los datos iniciales.
6. La API queda escuchando y arranca el frontend.

El chequeo de salud es lo que evita el problema clásico de que el primer arranque falle y el
segundo funcione: declarar dependencia sin él solo espera a que el contenedor exista, no a que el
motor acepte conexiones.

---

## 4. Datos iniciales

El *seed* crea un usuario por rol, con contraseña conocida y solo apta para desarrollo:

| Rol | Correo | Para qué sirve |
|---|---|---|
| `ADMIN` | admin@local | Borrado lógico y revocación de sesiones |
| `ANALISTA` | analista@local | Operación habitual sobre créditos |
| `ASOCIADO` | asociado@local | Verificar que solo alcanza sus propios créditos |

Y un conjunto de créditos repartidos entre los distintos estados, para que el tablero y los
filtros tengan contenido desde el primer arranque.

---

## 5. Trabajo diario

```bash
# Cambio de esquema: se edita la entidad y se genera la migración
npm run migration:generate -- src/migraciones/NombreDescriptivo
npm run migration:run

# Pruebas
npm run test          # unitarias
npm run test:e2e      # extremo a extremo, contra base efímera

# Volver a un estado limpio
docker compose down -v && docker compose up --build
```

La base de datos no se modifica a mano. Todo cambio de estructura pasa por una entidad y su
migración (ver `arquitectura/02_modelo_de_datos.md`).

---

## 6. Frontend y API en el mismo origen

En desarrollo, el frontend corre en el puerto 5173 y la API en el 3000, lo que los convierte en
orígenes distintos. Como la autenticación usa cookies, esto importa.

El `proxy` de Vite redirige `/api` al backend, de modo que el navegador ve un solo origen. Es
preferible a configurar CORS con credenciales porque reproduce la situación de producción, donde
ambos van detrás del mismo dominio, y evita depurar problemas de cookies que solo existen en
desarrollo.

El destino de ese proxy depende de dónde corra el frontend: dentro de `docker compose` la API es
el servicio `api` y la composición lo pasa en `API_URL`; fuera de Docker, `vite.config.ts` cae en
`http://localhost:${API_PORT_HOST}` leído del `.env` de la raíz. El mismo proxy está declarado en
`server` y en `preview`, porque la composición sirve el build, no el servidor de desarrollo.

**El contenedor `web` sirve la compilación (`vite preview`), no `vite dev`.** El servidor de
desarrollo recarga la página entera la primera vez que pre-empaqueta una dependencia nueva, y esa
recarga borra un formulario a medio llenar. Para desarrollar con recarga en caliente, `npm run dev`
en `web/` contra la API que publica la composición.

Si aun así se trabaja con orígenes separados: CORS debe declarar el origen exacto y permitir
credenciales, y el cliente enviar `credentials: 'include'`. El comodín `*` no funciona con
cookies.

---

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| La API no arranca y reporta configuración faltante | Falta una variable obligatoria en `.env` | Comparar contra `.env.example`; la validación de arranque es intencional |
| SQL Server rechaza la contraseña | No cumple la política del motor | Mínimo 8 caracteres con mayúsculas, minúsculas y dígitos |
| Todas las peticiones responden 401 | El cliente no envía la cookie | Verificar `credentials: 'include'` y que el proxy esté activo |
| Las escrituras responden 403 `CSRF_INVALIDO` | Falta la cabecera anti-CSRF | El cliente debe copiar la cookie `csrf-token` a `X-CSRF-Token` |
| Una migración falla al aplicarse | El diff generado no era el esperado | Revisar el SQL de la migración; ver los casos conocidos en `arquitectura/02_modelo_de_datos.md` |
| El puerto 1433 está ocupado | Hay otra instancia de SQL Server local | Cambiar el mapeo de puertos en la composición |
