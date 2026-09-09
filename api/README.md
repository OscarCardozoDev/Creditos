# api — Módulo de créditos

API REST del sistema de solicitudes de crédito. NestJS 11 + TypeScript, TypeORM sobre
SQL Server 2022.

El arranque completo del entorno está en el [README de la raíz](../README.md); este archivo
cubre lo que hace falta para trabajar dentro de `api/`. Las decisiones y su argumento viven en
[`Documentación/`](../Documentación/).

## Ejecución

Lo habitual es levantar todo con `docker compose up --build` desde la raíz. Para correr solo la
API contra el SQL Server del contenedor:

```bash
npm install
npm run migration:run     # crea la base si falta y aplica las migraciones
npm run seed              # usuarios y créditos de ejemplo
npm run start:dev         # http://localhost:3000/api
```

Las variables salen del `.env` de la raíz. La API **no arranca si falta una obligatoria**: la
validación de arranque es intencional, para que un despliegue mal configurado falle al instante
y no a la primera petición.

## Comandos

```bash
npm run start:dev                                        # con recarga
npm run build                                            # compila a dist/
npm run lint                                             # eslint --fix
npm test                                                 # unitarias, sin infraestructura
npm run test:e2e                                         # contra SQL Server real y efímero
npm run migration:generate -- src/migraciones/Nombre     # genera desde las entidades
npm run migration:run                                    # aplica las pendientes
npm run migration:revert                                 # deshace la última
npm run seed                                             # datos iniciales
```

`synchronize` está en `false`. El esquema vive en `src/entidades/` y se aplica **por migración**;
la base no se modifica a mano, tampoco en desarrollo. La migración generada se lee antes de
aplicarse: los renombres y las columnas obligatorias salen mal por defecto.

## Estructura

```
src/
├── main.ts              arranque, helmet, cookies, cuerpo crudo del webhook
├── configurar-app.ts    ValidationPipe, filtro e interceptor globales (compartido con e2e)
├── config/              variables validadas y DataSource de TypeORM
├── entidades/           fuente de verdad del esquema · enums del dominio
├── migraciones/         historial del esquema, en orden
├── comun/               DTO de paginación, filtro de errores, interceptor, requestId
├── auth/                sesiones de servidor, guards de sesión, CSRF y rol
├── usuarios/            alta y consulta de usuarios
├── creditos/            CRUD, máquina de estados, reglas de producto, cuotas y pagos
├── historial/           bitácora append-only
├── simulacion/          motor de amortización, tasas y política por producto
├── notificaciones/      bandeja de salida, entrega firmada y webhook entrante
├── crear-base.ts        crea la base si no existe, antes de migrar
└── semilla.ts           datos iniciales de desarrollo
```

Cada módulo sigue la convención de
[`arquitectura/01_vision_general.md §4`](../Documentación/arquitectura/01_vision_general.md).
Un controlador no toca el `EntityManager`; un repositorio no lanza excepciones HTTP.

## Endpoints

Documentación interactiva en `/api/docs` (Swagger), nunca en producción: es también un mapa de
ataque.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del proceso y de la conexión a la base |
| `POST` | `/api/auth/login` | Autentica y crea la sesión |
| `POST` | `/api/auth/logout` | Revoca la sesión actual |
| `GET` | `/api/auth/yo` | Usuario, rol y tipo de persona de la sesión |
| `GET` | `/api/auth/sesiones` | Sesiones activas del usuario |
| `DELETE` | `/api/auth/sesiones/:id` | Cierra una sesión concreta |
| `POST` | `/api/usuarios` | Alta de usuario y, si se piden, sus credenciales |
| `GET` | `/api/usuarios` | Listado paginado |
| `GET` | `/api/usuarios/:id` | Detalle |
| `DELETE` | `/api/usuarios/:id/sesiones` | Cierra todas las sesiones de un usuario |
| `POST` | `/api/simulacion` | Plan de amortización sin persistir nada |
| `POST` | `/api/creditos` | Registra la solicitud, su historial y su notificación |
| `GET` | `/api/creditos` | Listado con paginación, filtros, orden y búsqueda |
| `GET` | `/api/creditos/resumen` | Conteos y montos por estado, para el tablero |
| `GET` | `/api/creditos/:id` | Detalle con las transiciones válidas |
| `PATCH` | `/api/creditos/:id` | Edita condiciones · exige `If-Match` |
| `PATCH` | `/api/creditos/:id/estado` | Único punto por donde cambia el estado |
| `DELETE` | `/api/creditos/:id` | Borrado lógico |
| `GET` | `/api/creditos/:id/historial` | Bitácora del crédito |
| `GET` | `/api/creditos/:id/cuotas` | Plan de cuotas y su estado de pago |
| `POST` | `/api/creditos/:id/cuotas/:numero/pago` | Registra el pago de una cuota |
| `POST` | `/api/webhooks/creditos` | Receptor firmado con HMAC |

Toda respuesta viaja envuelta: `{success, data, meta}` en el éxito y
`{success, error:{code, message, details, requestId}}` en el error, siempre desde el filtro
global. Ningún controlador arma una respuesta de error, y nunca sale al cliente una traza, un
mensaje del motor ni un nombre de tabla.

## Reglas que el código no negocia

1. `estado` no aparece en ningún DTO de escritura: solo cambia por `PATCH /creditos/:id/estado`,
   validando la transición contra el mapa de la máquina de estados.
2. Ningún cambio de estado sin su fila de `HistorialCredito`, en la misma transacción. La
   bitácora es *append-only*: nunca `UPDATE` ni `DELETE`.
3. Nada se borra físicamente. `eliminado_en` es una columna aparte, no un estado; un crédito
   borrado responde `404`.
4. La notificación se escribe en `Notificaciones` dentro de la transacción de creación (patrón
   *outbox*). Con el sistema externo caído, registrar un crédito sigue devolviendo `201`.
5. `sort` jamás se interpola en SQL: mapa fijo de campos permitidos, y `limit` con tope de 100.
6. Toda consulta de créditos filtra `eliminado_en IS NULL`, y el repositorio le impone al rol
   `ASOCIADO` un `deudor_id` igual al usuario de la sesión.
7. Montos en `DECIMAL(18,2)`, tasas en `DECIMAL(9,6)`, fechas `DATETIME2(3)` en UTC. El cálculo
   usa `decimal.js`, nunca `number`.
8. Concurrencia por `ROWVERSION` explícito (`WHERE row_version = @v`). Cero filas afectadas →
   `409 CONCURRENCIA_CONFLICTO`.

## Pruebas

```bash
npm test        # 86 casos: amortización, máquina de estados, fechas, firma y reintentos
npm run test:e2e # 21 casos contra SQL Server real
```

Las e2e no usan una base en memoria: lo que prueban son restricciones reales del motor —índices
filtrados, `CHECK`, `ROWVERSION`— que un sustituto no reproduce. La estrategia y el catálogo de
casos están en
[`Documentación/operacion/02_pruebas.md`](../Documentación/operacion/02_pruebas.md).
