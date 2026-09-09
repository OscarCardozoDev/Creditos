# Verificación manual con Postman

Guion para ejercitar la API entera desde un cliente HTTP, módulo por módulo. No es la suite
automatizada: **[`operacion/02_pruebas.md`](../operacion/02_pruebas.md)** documenta lo que corren
Jest y Supertest (unitarias sin infraestructura, extremo a extremo contra SQL Server real,
integración simulada de notificaciones). Esta carpeta cubre lo mismo desde afuera, para:

- Verificar cada módulo contra su contrato documentado, con peticiones reales y encadenadas.
- Dejar un guion reproducible con el que armar la colección de Postman.
- Servir de checklist de aceptación humana: cosas que Supertest verifica por código (formato de
  cookie, cabeceras, encadenamiento entre peticiones) pero que conviene también ver pasar en un
  cliente real.

Ningún caso de aquí duplica una prueba automatizada: cuando coinciden en el escenario (por
ejemplo, "sesión revocada responde 401"), es porque los dos niveles de prueba lo consideran crítico,
no porque este documento repita el otro. Si en algún momento un caso de aquí y uno de
`operacion/02_pruebas.md` divergieran en el resultado esperado, hay un defecto que corregir, no una
ambigüedad que resolver a favor de uno u otro.

---

## 1. Preparar el entorno

```bash
docker compose up --build
```

Deja SQL Server migrado con *seed* y la API respondiendo. Para partir de un estado limpio:

```bash
docker compose down -v && docker compose up --build
```

La API vive detrás del prefijo `/api`. En un `docker compose up` sin tocar `.env`, la URL es:

```
http://localhost:3000/api
```

**El puerto publicado puede ser otro.** `docker-compose.yml` mapea el contenedor con
`"${API_PORT_HOST:-3000}:3000"`: si el `.env` local define `API_PORT_HOST` (por ejemplo, para no
chocar con otro servicio en el `3000` de la máquina), la API queda expuesta en ese puerto y no en
el `3000`. Antes de correr la colección, revisa `API_PORT_HOST` en el `.env` del proyecto y ajusta
la variable `baseUrl` de la sección siguiente.

---

## 2. Variables de la colección

Se definen a nivel de colección, no de entorno, para que el script del login (§3) las pueda
escribir con `pm.collectionVariables.set(...)`.

| Variable | Para qué sirve | Quién la escribe |
|---|---|---|
| `baseUrl` | Raíz de la API, `http://localhost:3000/api` salvo que `API_PORT_HOST` diga otra cosa | Se fija a mano al crear la colección |
| `csrfToken` | Valor de la cookie `csrf-token`, copiado a la cabecera `X-CSRF-Token` en cada escritura | El script de *Tests* del login (§3) |
| `creditoId` | `id` del crédito principal, creado en `04_creditos.md` caso 1 y llevado hasta `APROBADO`; lo reutilizan `04_creditos.md` y toda `05_cuotas_y_pagos.md` | El script de *Tests* de `POST /creditos` |
| `version` | `version` (el `ROWVERSION` en base64) del último estado leído de `{{creditoId}}`, para la cabecera `If-Match` del `PATCH` | El script de *Tests* de `POST /creditos` y de cada `PATCH`/`GET /creditos/:id` |
| `versionInicial` | `version` justo después de crear el crédito, antes de su primer cambio de estado — se usa una sola vez, para forzar el `409` de concurrencia (`04_creditos.md` caso 14) | El script de *Tests* de `POST /creditos` |
| `creditoRechazadoId` | Crédito auxiliar y desechable, llevado a `RECHAZADO`, solo para probar la transición inválida desde un estado terminal (`04_creditos.md` caso 12) | El script de *Tests* del `POST /creditos` de ese caso |
| `creditoBorradoId` | Crédito auxiliar y desechable, solo para el borrado lógico (`04_creditos.md` casos 17 y 18), así el borrado no consume el crédito que necesita `05_cuotas_y_pagos.md` | El script de *Tests* del `POST /creditos` de ese caso |
| `vencimientoCuota1` / `vencimientoCuota2` | `fechaVencimiento` de las dos primeras cuotas de `{{creditoId}}`, para calcular la `fechaPago` de `05_cuotas_y_pagos.md` casos 6 y 8 | El script de *Tests* de `GET /creditos/:id/cuotas` |
| `creditoSolicitadoId` | Crédito auxiliar dejado en `SOLICITADO`, para comprobar que aún no tiene cuotas (`05_cuotas_y_pagos.md` caso 14) | El script de *Tests* del `POST /creditos` de ese caso |
| `usuarioId` | `usuarioId` creado en la carpeta de usuarios, para encadenar el `GET /usuarios/:id` | El script de *Tests* de `POST /usuarios` |
| `sesionId` | Identificador de una sesión propia, para el `DELETE /auth/sesiones/:id` | El script de *Tests* de `GET /auth/sesiones` |
| `webhookSecret` | Copia del `WEBHOOK_SECRET` del `.env` de la API, para firmar a mano el cuerpo que Postman manda al receptor del webhook | Se pega a mano al preparar la colección; nunca viaja en el archivo compartido |
| `webhookBody` / `webhookSignature` | El cuerpo exacto que se firma y la firma resultante, para que la petición mande byte a byte lo mismo que se firmó (`06_notificaciones_webhook.md` casos 8, 10 y 11) | El *pre-request script* de cada caso del receptor |

`baseUrl` no lo escribe ningún script porque no cambia durante la ejecución; las demás sí, porque
dependen de lo que la propia colección va creando.

---

## 3. Sesión y CSRF en Postman

El cliente de Postman mantiene la cookie de sesión (`__Host-sid`) sola, en su *cookie jar*: basta
con activar "Automatically follow redirects" por defecto y nada más — cada petición posterior a un
login exitoso ya la lleva. Pero la cookie anti-CSRF (`csrf-token`, sin `HttpOnly` según
[`modulos/01_autenticacion_y_sesiones.md §6`](../modulos/01_autenticacion_y_sesiones.md)) no la
copia el cliente solo a la cabecera: eso lo hace un script.

En la pestaña **Tests** de `POST /auth/login`:

```javascript
const csrf = pm.cookies.get('csrf-token');
if (csrf) pm.collectionVariables.set('csrfToken', csrf);
```

Y en **toda** petición de escritura (`POST`, `PATCH`, `DELETE`) de la colección, la cabecera:

```
X-CSRF-Token: {{csrfToken}}
```

Sin esa cabecera, la petición responde `403 CSRF_INVALIDO` — es justamente el caso 01.06 de
autenticación, que existe para comprobar que la protección funciona antes de confiarle el resto de
la colección.

---

## 4. Credenciales de prueba

Sembradas por `api/src/semilla.ts`, contraseña única para los tres:

| Correo | Rol |
|---|---|
| `admin@local` | `ADMIN` |
| `analista@local` | `ANALISTA` |
| `asociado@local` | `ASOCIADO` |

```
password: Desarrollo.2026
```

No sirven fuera de un entorno local — así lo advierte el propio *seed*.

---

## 5. Orden de ejecución de las carpetas

```
01_autenticacion  →  02_usuarios  →  03_simulacion  →  04_creditos  →  05_cuotas_y_pagos  →  06_notificaciones_webhook
```

**Autenticación va primero porque todo lo demás necesita sesión.** Cualquier ruta sin `@Publico()`
responde `401 NO_AUTENTICADO` sin cookie (`modulos/01_autenticacion_y_sesiones.md §7`). El primer caso de esa carpeta deja escrito
`csrfToken`; sin él, toda escritura de las carpetas siguientes falla por CSRF antes de llegar a la
regla de negocio que se quiere probar.

Después:

- **Usuarios** antes que **créditos**, porque varios casos de créditos verifican reglas que cruzan
  con el perfil del deudor (`modulos/02_creditos.md §7`), y conviene tener claro qué usuario es cada
  cosa antes de crear solicitudes sobre ellos.
- **Simulación** antes que **créditos**, porque `cuotaMensual` en la respuesta de un crédito sale
  del mismo motor: los valores de referencia de `modulos/03_simulacion.md §6` sirven para verificar
  ambos.
- **Cuotas y pagos** depende de tener un crédito llevado hasta `APROBADO`, así que va después de
  **créditos** y reutiliza el `creditoId` que esa carpeta dejó en la variable de colección.
- **Notificaciones y webhook** va al final: sus casos 1, 2 y 6 verifican lo que ya generaron las
  carpetas anteriores (la fila en `Notificaciones` que deja cada alta y cada cambio de estado), y
  el receptor (`POST /api/webhooks/creditos`) reutiliza el mismo `CreditosService.crear()` que
  `04_creditos.md` ya ejercitó por la vía normal.

Correr las carpetas fuera de este orden no rompe nada de forma permanente, pero varios casos
asumen que la variable que necesitan ya quedó escrita por una carpeta anterior.

---

## 6. Archivos de esta carpeta

| Archivo | Casos | Módulo que cubre |
|---|---|---|
| [`01_autenticacion.md`](01_autenticacion.md) | 10 | Sesiones, CSRF, roles |
| [`02_usuarios.md`](02_usuarios.md) | 7 | Alta y consulta de usuarios |
| [`03_simulacion.md`](03_simulacion.md) | 4 | Motor de amortización |
| [`04_creditos.md`](04_creditos.md) | 20 | Ciclo de vida del crédito |
| [`05_cuotas_y_pagos.md`](05_cuotas_y_pagos.md) | 14 | Plan de pagos y mora |
| [`06_notificaciones_webhook.md`](06_notificaciones_webhook.md) | 7 + 4 del receptor | Bandeja de salida y receptor |

Cada archivo detalla, cuando hace falta, el cuerpo JSON completo, las cabeceras especiales
(`If-Match`, `X-CSRF-Token`, `X-Signature`) y el script de *Tests* para encadenar variables. Los
casos que son la razón de ser de su módulo van en **negrita**.
