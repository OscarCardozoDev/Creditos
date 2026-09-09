# 04 · Créditos

El módulo grande. Contrato completo en
[`modulos/02_creditos.md`](../modulos/02_creditos.md); catálogo de errores en
[`arquitectura/04_manejo_de_errores.md`](../arquitectura/04_manejo_de_errores.md).

**Preparación:** sesión activa como `analista@local` o `admin@local`, con `csrfToken` fresco. Los
casos 1, 11, 13, 14 y 15 encadenan sobre el **mismo** crédito (`{{creditoId}}`); el caso 12 necesita
uno aparte, ya llevado a un estado terminal, así que usa una variable local
`creditoRechazadoId` que no interfiere con el resto de la carpeta. El caso 19 necesita, además, una
sesión como `asociado@local`.

> **Nota sobre `identificacionAsociado`.** El *seed* ya deja vivos (`SOLICITADO` o `EN_ESTUDIO`) un
> `LIBRE_INVERSION` de 15.000.000 y un `VEHICULO` de 40.000.000 para la identificación
> `1001234567`. La definición de duplicado (`modulos/02_creditos.md §7`) compara `deudor + tipo +
> valor` entre créditos vivos, así que reusar esa identificación con esos mismos datos dispararía
> un `409` en el propio caso 1. Los cuerpos de esta guía usan una identificación nueva
> (`1005556677`) para partir de una base limpia; el caso 4 sí reutiliza `1001234567` a propósito,
> porque necesita una identificación que **ya exista** como persona natural.

## Casos

| # | Petición | Cuerpo o parámetros | Esperado | Qué demuestra |
|---|---|---|---|---|
| 1 | `POST /api/creditos` | Válido (detalle abajo) | 201, `estado: "SOLICITADO"`, `numeroCredito` con formato `CR-2026-NNNNNN` | El alta completa deja el crédito, su historial y su notificación en una sola transacción |
| 2 | `POST /api/creditos` | Repetir exactamente el cuerpo del caso 1 | 409 `CREDITO_DUPLICADO` | El doble clic o el reintento automático no crea una segunda solicitud |
| 3 | `POST /api/creditos` | `valorSolicitado: -1` | 400 `VALIDATION_ERROR` | Un valor negativo no es válido en ningún contexto: se corta en el DTO |
| 4 | `POST /api/creditos` | `tipoCredito: "COMERCIAL"`, deudor persona natural (`1001234567`) | 422 `REGLA_NEGOCIO` | `COMERCIAL` exige persona jurídica; la regla cruza `Creditos` con `Usuarios` y por eso vive en el servicio, no en un `CHECK` |
| 5 | `POST /api/creditos` | `tipoCredito: "LIBRANZA"`, `formaPago: "CAJA"` | 422 `REGLA_NEGOCIO` | La libranza se descuenta de nómina por definición del producto |
| 6 | `POST /api/creditos` | Cuerpo válido + `"estado": "APROBADO"` | 400 `VALIDATION_ERROR` | `estado` no está en `CrearCreditoDto`; `forbidNonWhitelisted` lo rechaza en vez de ignorarlo |
| 7 | `GET /api/creditos/{{creditoId}}` | — | 200, con `cuotaMensual` y `transicionesPermitidas` | El detalle expone lo calculado al vuelo, no solo la fila persistida |
| 8 | `GET /api/creditos?estado=SOLICITADO&page=1&limit=5` | — | 200, todas las filas con `estado: "SOLICITADO"`, `meta` coherente | El filtro por estado se aplica junto con la paginación |
| 9 | `GET /api/creditos?sort=tasaInteres:asc` | — | 200, `data` ordenada ascendente por `tasaInteres` | `sort` resuelve contra la lista blanca de `creditos.repository.ts`, no se concatena |
| 10 | `GET /api/creditos?sort=; DROP TABLE Creditos--` | — | 400 `VALIDATION_ERROR`, la tabla `Creditos` sigue intacta | El único punto de la consulta que no usa parámetros preparados está cerrado por el `@Matches` del DTO, antes de llegar al repositorio |
| 11 | `PATCH /api/creditos/{{creditoId}}/estado` | `{ "estado": "APROBADO", "observacion": "Cumple capacidad de pago" }` | 200, fila nueva en `HistorialCredito` y plan de cuotas generado | El cambio de estado, su bitácora y el plan viven en la misma transacción |
| 12 | `PATCH /api/creditos/{{creditoRechazadoId}}/estado` | `{ "estado": "DESEMBOLSADO" }`, sobre un crédito ya `RECHAZADO` | 422 `TRANSICION_INVALIDA` | `RECHAZADO` es terminal: el mapa de estados no contempla ningún destino |
| 13 | `PATCH /api/creditos/{{creditoAuxiliarId}}/estado` | `{ "estado": "RECHAZADO" }`, sin `observacion`, sobre un crédito aún `SOLICITADO` | 400 `VALIDATION_ERROR` | Rechazar sin motivo dejaría la bitácora sin poder responder por qué |
| 14 | `PATCH /api/creditos/{{creditoId}}` | Datos válidos, `If-Match` con la versión **anterior** a la del caso 11 | 409 `CONCURRENCIA_CONFLICTO` | El `UPDATE` condicionado por `row_version` detecta la escritura pisada sin bloqueos previos |
| 15 | `PATCH /api/creditos/{{creditoId}}` | Datos válidos, sobre un crédito ya `APROBADO` | 422 `CREDITO_INMUTABLE` | Una vez aprobado, las condiciones financieras son un hecho, no un dato editable |
| 16 | `GET /api/creditos/{{creditoId}}/historial` | — | 200, orden descendente, cada fila con `usuarioNombre` | La bitácora es legible por sí sola, sin tener que resolver el usuario aparte |
| 17 | `DELETE /api/creditos/{{creditoBorradoId}}`, luego `GET` del mismo id | — | 204; después 404 `CREDITO_NOT_FOUND` | El borrado lógico oculta el recurso sin destruir la fila |
| 18 | `GET /api/creditos` tras el caso 17 | — | `{{creditoBorradoId}}` no aparece en `data` | El listado respeta `eliminado_en IS NULL` igual que la consulta directa |
| 19 | `GET /api/creditos/{{creditoId}}` como `asociado@local` | — | 403 `SIN_PERMISO` | El filtro de visibilidad del `ASOCIADO` protege el recurso, no solo la ruta |
| 20 | `GET /api/creditos/resumen` | — | 200, `total` y `porEstado` cuadran con lo que devuelve el listado sin filtro | El resumen y el listado leen la misma fuente de verdad |

---

## Detalle

### 1 · Alta válida

```json
POST /api/creditos
X-CSRF-Token: {{csrfToken}}

{
  "identificacionAsociado": "1005556677",
  "nombreAsociado": "Persona de Prueba",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 15000000,
  "tasaInteres": 1.5,
  "numeroCuotas": 36,
  "formaPago": "NOMINA"
}
```

Responde `201` con cabecera `Location: /api/creditos/{id}` y `cuotaMensual: "542285.93"` (mismo
valor de referencia que `modulos/03_simulacion.md §6`). El consecutivo de `numeroCredito` depende
de cuántos créditos existen ya en la base — el *seed* crea 6 — así que no será `CR-2026-000001`;
validar el **formato** con `/^CR-\d{4}-\d{6}$/`, no el número exacto.

**Script de Tests:**

```javascript
const cuerpo = pm.response.json().data;
pm.collectionVariables.set('creditoId', cuerpo.id);
pm.collectionVariables.set('version', cuerpo.version);
pm.collectionVariables.set('versionInicial', cuerpo.version); // para el caso 14
```

### 2 · Duplicado

Repetir exactamente el cuerpo del caso 1, misma sesión. `existeDuplicado` compara deudor, tipo y
valor entre créditos vivos (`SOLICITADO` o `EN_ESTUDIO`); como el del caso 1 sigue en
`SOLICITADO`, la segunda petición choca con `409 CREDITO_DUPLICADO`.

### 3 · Valor negativo

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556678",
  "nombreAsociado": "Otra Persona",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": -1,
  "numeroCuotas": 36,
  "formaPago": "NOMINA"
}
```

`@IsPositive()` en `CrearCreditoDto.valorSolicitado` corta antes de abrir transacción: `400`, no
`422`. Ninguna fila se escribe.

### 4 · Producto incompatible con el perfil

```json
POST /api/creditos
{
  "identificacionAsociado": "1001234567",
  "nombreAsociado": "Juan Perez",
  "tipoCredito": "COMERCIAL",
  "valorSolicitado": 50000000,
  "numeroCuotas": 48,
  "formaPago": "DEBITO_AUTOMATICO"
}
```

`1001234567` ya existe como `PERSONA_NATURAL` (del *seed*). `COMERCIAL` exige
`PERSONA_JURIDICA` (`modulos/02_creditos.md §7`): `exigirPerfilCompatible` lo rechaza con `422
REGLA_NEGOCIO` antes de tocar la tabla de duplicados.

### 5 · Forma de pago incompatible

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556679",
  "nombreAsociado": "Tercera Persona",
  "tipoCredito": "LIBRANZA",
  "valorSolicitado": 6000000,
  "numeroCuotas": 24,
  "formaPago": "CAJA"
}
```

`LIBRANZA` solo admite `formaPago: "NOMINA"`. Responde `422 REGLA_NEGOCIO`.

### 6 · Campo prohibido

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556680",
  "nombreAsociado": "Cuarta Persona",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 15000000,
  "tasaInteres": 1.5,
  "numeroCuotas": 36,
  "formaPago": "NOMINA",
  "estado": "APROBADO"
}
```

`CrearCreditoDto` no declara `estado`: es, textualmente, "el único sitio por donde `estado` entra
al sistema" el `PATCH /estado`, no este endpoint. `forbidNonWhitelisted` rechaza la petición
entera con `400`, no descarta el campo en silencio.

### 7 · Detalle con calculados

```
GET /api/creditos/{{creditoId}}
```

Revisar que la respuesta trae `cuotaMensual` (no persistida, calculada al vuelo) y
`transicionesPermitidas` (en `SOLICITADO`, debe ser `["APROBADO", "RECHAZADO", "CANCELADO"]`).

**Script de Tests** (por si el `PATCH` del caso 11 se ejecuta más tarde de lo esperado, refresca
`version` con el valor más reciente):

```javascript
pm.collectionVariables.set('version', pm.response.json().data.version);
```

### 8, 9 y 10 · Listado, orden y el intento de inyección

```
GET /api/creditos?estado=SOLICITADO&page=1&limit=5
GET /api/creditos?sort=tasaInteres:asc
GET /api/creditos?sort=%3B%20DROP%20TABLE%20Creditos--
```

El tercero no cumple `/^[a-zA-Z]+:(asc|desc)$/` (el `@Matches` de `PaginacionDto.sort`): la
petición ni siquiera llega al repositorio, responde `400 VALIDATION_ERROR`. Confirmar después con
cualquier otro `GET /api/creditos` que la tabla sigue respondiendo con datos.

### 11 · Transición válida

```json
PATCH /api/creditos/{{creditoId}}/estado
X-CSRF-Token: {{csrfToken}}

{ "estado": "APROBADO", "observacion": "Cumple capacidad de pago" }
```

`200`. Revisar con el caso 16 (o directamente `GET /api/creditos/{{creditoId}}/historial`) que
apareció una fila nueva con `estadoAnterior: "SOLICITADO"`, `estadoNuevo: "APROBADO"`. La
aprobación además escribe el plan de cuotas, que `05_cuotas_y_pagos.md` da por hecho.

**Script de Tests:**

```javascript
pm.collectionVariables.set('version', pm.response.json().data.version);
```

### 12 · Transición desde un estado terminal

Requiere un crédito propio ya en `RECHAZADO`, distinto del que usan los demás casos:

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556677",
  "nombreAsociado": "Persona de Prueba",
  "tipoCredito": "MICROCREDITO",
  "valorSolicitado": 5000000,
  "numeroCuotas": 12,
  "formaPago": "CAJA"
}
```

Guardar el `id` en `creditoRechazadoId` y llevarlo directamente a `RECHAZADO` (con `observacion`)
repitiendo el patrón del caso 11. Con ese crédito ya terminal:

```json
PATCH /api/creditos/{{creditoRechazadoId}}/estado
{ "estado": "DESEMBOLSADO" }
```

`422 TRANSICION_INVALIDA`. El mensaje enumera los destinos que sí eran válidos desde el estado
actual — que, al ser `RECHAZADO`, es una lista vacía.

### 13 · Observación obligatoria

Este caso necesita un crédito que **siga en `SOLICITADO`**: `{{creditoId}}` ya quedó `APROBADO`
en el caso 11. Crear uno auxiliar con el cuerpo del caso 1 (cambiando el valor para no chocar con
el índice anti-duplicado), guardar su `id` en `creditoAuxiliarId` y sobre él:

```json
PATCH /api/creditos/{{creditoAuxiliarId}}/estado
{ "estado": "RECHAZADO" }
```

La transición en sí es válida; falla por la falta de `observacion`, que
`ESTADOS_QUE_EXIGEN_OBSERVACION` exige al pasar a `RECHAZADO` o `CANCELADO`.
`400 VALIDATION_ERROR`, y el crédito **no** cambia de estado.

La observación tiene además un largo mínimo de **3 caracteres**, obligatoria u opcional: un
`"ok"` responde `400` igual que la ausencia.

### 14 · Conflicto de concurrencia

```
PATCH /api/creditos/{{creditoId}}
X-CSRF-Token: {{csrfToken}}
If-Match: {{versionInicial}}

{ "valorSolicitado": 16000000 }
```

`{{versionInicial}}` es la versión que quedó guardada justo después del caso 1, antes de que el
caso 11 escribiera una nueva fila (y con ella, un `row_version` distinto). El `UPDATE ... WHERE
row_version = @v` no afecta ninguna fila: `409 CONCURRENCIA_CONFLICTO`.

### 15 · Inmutabilidad tras aprobar

Antes de este caso, avanzar `{{creditoId}}` hasta `APROBADO`:

```json
PATCH /api/creditos/{{creditoId}}/estado
{ "estado": "APROBADO", "observacion": "Cumple capacidad de pago" }
```

Este paso también genera las 36 filas de `Cuotas` que reutiliza `05_cuotas_y_pagos.md` — la razón
por la que esa carpeta va después de esta. Con el crédito ya `APROBADO`:

```json
PATCH /api/creditos/{{creditoId}}
If-Match: {{version}}

{ "valorSolicitado": 16000000 }
```

`422 CREDITO_INMUTABLE`. `ESTADOS_EDITABLES` solo incluye `SOLICITADO` y `EN_ESTUDIO`; un crédito
aprobado ya no admite cambios en sus condiciones.

### 16 · Bitácora legible

```
GET /api/creditos/{{creditoId}}/historial
```

Debe devolver, de más reciente a más antigua: `APROBADO` (del caso 11) y `SOLICITADO` (de la
creación). Cada fila trae `usuarioNombre` ya resuelto — no un `usuarioId` que haya que cruzar
contra otra tabla.

### 17 y 18 · Borrado lógico

`{{creditoId}}` sigue `APROBADO` con su plan de cuotas: `05_cuotas_y_pagos.md` lo necesita intacto,
así que el borrado se prueba sobre un crédito auxiliar, desechable, creado solo para este caso:

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556677",
  "nombreAsociado": "Persona de Prueba",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 4000000,
  "numeroCuotas": 12,
  "formaPago": "CAJA"
}
```

Guardar el `id` en `creditoBorradoId`. No hace falta llevarlo a ningún estado en particular: el
borrado lógico funciona sobre cualquier estado, terminal o no, porque es ortogonal al ciclo de
vida (`modulos/02_creditos.md §6`).

`DELETE` exige rol `ADMIN`: reautenticar como `admin@local` (nuevo login, nuevo `csrfToken`) antes
de esta petición.

```
DELETE /api/creditos/{{creditoBorradoId}}
X-CSRF-Token: {{csrfToken}}
```

`204`, y el `GET /api/creditos/{{creditoBorradoId}}` que
sigue responde `404 CREDITO_NOT_FOUND` — nunca `410`. El caso 18 confirma lo mismo desde el
listado: `GET /api/creditos?q=1005556677&limit=100` ya no trae esa fila, aunque sigue trayendo
`{{creditoId}}`.

### 19 · Recurso ajeno

Autenticarse como `asociado@local` (nuevo login, nuevo `csrfToken`) y pedir un crédito que no le
pertenece — por ejemplo, el mismo `{{creditoId}}`, cuyo deudor es `1005556677`, no
`asociado@local`:

```
GET /api/creditos/{{creditoId}}
```

`403 SIN_PERMISO`, no `404`: el crédito existe, solo que el repositorio ya lo excluyó por el
filtro `deudor_id = <usuario de la sesión>` antes de que el servicio decida.

### 20 · Resumen

```
GET /api/creditos/resumen
```

`{ "total": N, "porEstado": [{ "estado": "SOLICITADO", "total": n1 }, ...] }`. Sumar los `total`
de `porEstado` debe dar el mismo `total`, y cada `n` debe coincidir con
`GET /api/creditos?estado=X&limit=100` → `meta.total` para ese mismo estado.
