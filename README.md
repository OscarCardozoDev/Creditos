# Módulo de Créditos

Sistema de solicitudes de crédito para una entidad del sector financiero solidario: registro,
evaluación, ciclo de vida de estados, historial auditable y notificación a sistemas externos.

Prueba técnica. La documentación completa, con las decisiones y sus compensaciones, vive en
[`Documentación/`](Documentación/) — este archivo solo cubre instalación, ejecución y ejemplos.
Empezar por [`Documentación/DECISIONES.md`](Documentación/DECISIONES.md) y
[`Documentación/arquitectura/01_vision_general.md`](Documentación/arquitectura/01_vision_general.md).

## Stack

- **Backend:** NestJS 11 + TypeScript, SQL Server 2022, TypeORM (las entidades son la fuente de
  verdad del esquema, aplicado por migración), `decimal.js` para aritmética de amortización,
  `argon2` para contraseñas, `helmet` y un limitador de peticiones.
- **Frontend:** React + Vite + TypeScript.
- **Entorno local:** Docker Compose.
- **Pruebas:** Jest + Supertest — unitarias sin infraestructura, extremo a extremo contra SQL
  Server real.

## Instalación y ejecución

Requisitos: Docker Desktop con Compose. Node.js 20+ solo si se quiere correr algo fuera de
contenedor.

```bash
git clone git@github.com:OscarCardozoDev/Creditos.git
cd Creditos
cp .env.example .env      # editar las contraseñas locales
docker compose up --build
```

Al terminar:

| Servicio | Dirección |
|---|---|
| API | http://localhost:3010/api |
| Documentación interactiva (Swagger) | http://localhost:3010/api/docs |
| Frontend | http://localhost:5173 |
| SQL Server | localhost:1433 |

El puerto expuesto de la API sale de `API_PORT_HOST` en `.env` (3010 en el `.env.example`); si se
cambia, ajustar las URLs de arriba y de los ejemplos de `curl` de este archivo.

La API aplica las migraciones y carga los datos iniciales al arrancar si la base está vacía.
Detalle de la secuencia de arranque y problemas frecuentes:
[`Documentación/operacion/01_entorno_local.md`](Documentación/operacion/01_entorno_local.md).

Para volver a un estado limpio:

```bash
docker compose down -v && docker compose up --build
```

## Credenciales de prueba

Sembradas por `api/src/semilla.ts`, solo válidas en desarrollo:

| Rol | Correo | Clave |
|---|---|---|
| ADMIN | `admin@local` | `Desarrollo.2026` |
| ANALISTA | `analista@local` | `Desarrollo.2026` |
| ASOCIADO | `asociado@local` | `Desarrollo.2026` |

## Pruebas

```bash
cd api
npm run test         # unitarias: motor de calculo, maquina de estados, reglas de dominio
npm run test:e2e      # extremo a extremo contra SQL Server real (arranca su propia base de
                       # datos de pruebas, aplica migraciones y siembra los usuarios de desarrollo)
```

`test:e2e` no usa una base en memoria: lo que prueba son restricciones reales del motor (índices
filtrados, `CHECK`, `ROWVERSION`) que un sustituto no reproduce. Detalle de la estrategia:
[`Documentación/operacion/02_pruebas.md`](Documentación/operacion/02_pruebas.md).

## Verificar el webhook

Cada crédito registrado y **cada** cambio de estado escriben un evento en `Notificaciones`,
dentro de la misma transacción. Un proceso los entrega por HTTP cada `WORKER_INTERVALO_MS`
(10 s), firmados con `HMAC-SHA256`. El repositorio trae un receptor sin dependencias para
comprobarlo:

```bash
node api/pruebas-manuales/receptor-webhook.mjs
```

Escucha en el puerto de `WEBHOOK_URL` (4000 por omisión), recalcula la firma por su cuenta y la
compara contra la cabecera `X-Signature`. Con él corriendo, registrar un crédito y cambiarle el
estado imprime:

```
✓ firma valida  credito.creado
  eventId    3009c925-b0fe-4d77-9b71-88a3070cb27f
  data       {"id":"...","numeroCredito":"CR-2026-000009","valorSolicitado":"12300000.00","estado":"SOLICITADO"}
  respondo   200

✓ firma valida  credito.estado_cambiado
  data       {"...","estadoAnterior":"SOLICITADO","estadoNuevo":"APROBADO"}
```

Que la firma se verifique con código ajeno al de la API es justamente lo que prueba que la
integridad del evento no depende de confiar en quien lo envía.

Para ver los reintentos, el receptor puede responder lo que se le pida:

```bash
node api/pruebas-manuales/receptor-webhook.mjs --estado=500   # transitorio: reintenta con retroceso
node api/pruebas-manuales/receptor-webhook.mjs --estado=400   # definitivo: queda FALLIDO sin reintentar
```

Y con el receptor apagado, registrar un crédito sigue respondiendo `201`: el sistema externo
caído nunca decide si un crédito se registra. El estado de la bandeja de salida se consulta en
la tabla `Notificaciones` (`estado`, `intentos`, `http_status`, `proximo_intento`).

El mecanismo completo —reclamación atómica, retroceso, firma e idempotencia por `eventId`— está
en [`Documentación/arquitectura/07_webhook.md`](Documentación/arquitectura/07_webhook.md).

## Estructura de carpetas

```
/
├── docker-compose.yml
├── .env.example
├── db/
│   └── esquema_generado.sql   volcado de las migraciones aplicadas; no es la fuente de verdad
├── api/
│   └── src/
│       ├── main.ts
│       ├── config/            variables de entorno validadas y opciones del origen de datos
│       ├── entidades/         fuente de verdad del esquema
│       ├── migraciones/       generadas, mas una inicial escrita a mano
│       ├── comun/             filtro de errores, interceptores, requestId
│       ├── auth/               sesiones, guards, roles
│       ├── usuarios/          usuarios y credenciales
│       ├── creditos/          ciclo de vida de la solicitud
│       ├── simulacion/        motor de calculo, sin dependencias
│       ├── historial/         bitacora append-only
│       └── notificaciones/    bandeja de salida y proceso de entrega
└── web/
    └── src/
        ├── api/                cliente HTTP tipado
        ├── paginas/            tablero, listado, registro, detalle
        └── componentes/
```

Detalle completo, con la regla de qué va en cada carpeta:
[`Documentación/arquitectura/01_vision_general.md §4`](Documentación/arquitectura/01_vision_general.md).

## Ejemplos con `curl`

Toda ruta exige sesión salvo las marcadas `@Publico()` (login, `/health`, el receptor del
webhook). Las escrituras (`POST`, `PATCH`, `DELETE`) exigen además la cabecera `X-CSRF-Token`
con el valor de la cookie `csrf-token` que entrega el login. Los ejemplos usan el archivo de
cookies de `curl` para no copiar el token a mano. Probados contra una API real levantada con
`docker compose up -d --build api`.

### Login

```bash
curl -c cookies.txt -X POST http://localhost:3010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"analista@local","password":"Desarrollo.2026"}'
```

Guarda la cookie de sesión `__Host-sid` y la cookie `csrf-token` en `cookies.txt`.

### Crear un crédito

```bash
CSRF=$(grep csrf-token cookies.txt | awk '{print $7}')

curl -b cookies.txt -X POST http://localhost:3010/api/creditos \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{
        "identificacionAsociado": "1009999001",
        "nombreAsociado": "Ejemplo Readme",
        "tipoCredito": "LIBRE_INVERSION",
        "valorSolicitado": 5000000,
        "numeroCuotas": 12,
        "formaPago": "CAJA"
      }'
```

Responde `201` con el crédito en estado `SOLICITADO`, su `id` y su `numeroCredito`
(`CR-2026-000102`, por ejemplo).

### Cambiar el estado de un crédito

```bash
CSRF=$(grep csrf-token cookies.txt | awk '{print $7}')
ID="<id devuelto al crear>"

curl -b cookies.txt -X PATCH "http://localhost:3010/api/creditos/$ID/estado" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"estado": "EN_ESTUDIO"}'
```

El campo `estado` nunca se envía en el `POST` de creación: solo cambia por este endpoint, que
valida la transición contra la máquina de estados y agrega la fila correspondiente al historial
en la misma transacción. Ver
[`Documentación/modulos/02_creditos.md`](Documentación/modulos/02_creditos.md).

### Listar créditos

```bash
curl -b cookies.txt "http://localhost:3010/api/creditos?estado=EN_ESTUDIO&page=1&limit=5"
```

Un `GET` no exige `X-CSRF-Token`. Un `ASOCIADO` solo ve sus propios créditos; el filtro lo impone
el repositorio, no el cliente.

## Documentación

- Contrato de la API, máquina de estados, reglas del dominio:
  [`Documentación/modulos/02_creditos.md`](Documentación/modulos/02_creditos.md)
- Sesiones, guards, roles: [`Documentación/modulos/01_autenticacion_y_sesiones.md`](Documentación/modulos/01_autenticacion_y_sesiones.md)
- Catálogo de errores: [`Documentación/arquitectura/04_manejo_de_errores.md`](Documentación/arquitectura/04_manejo_de_errores.md)
- Seguridad: [`Documentación/arquitectura/03_seguridad.md`](Documentación/arquitectura/03_seguridad.md)
- Modelo de datos y migraciones: [`Documentación/arquitectura/02_modelo_de_datos.md`](Documentación/arquitectura/02_modelo_de_datos.md)
- Decisiones técnicas, con su precio y sus límites conocidos: [`Documentación/DECISIONES.md`](Documentación/DECISIONES.md)
