# Módulo de Créditos

Núcleo del sistema. Administra el ciclo de vida de una solicitud de crédito, desde que se
registra hasta que se desembolsa o se descarta.

---

## 1. Qué expone

Prefijo `/api`. Todas las rutas exigen sesión activa.

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `POST` | `/creditos` | Registra una solicitud | ANALISTA, ADMIN, ASOCIADO |
| `GET` | `/creditos` | Lista con paginación, filtros, orden y búsqueda | Todos |
| `GET` | `/creditos/:id` | Consulta una solicitud | Todos |
| `PATCH` | `/creditos/:id` | Modifica datos editables | ANALISTA, ADMIN |
| `PATCH` | `/creditos/:id/estado` | Avanza el estado | ANALISTA, ADMIN |
| `DELETE` | `/creditos/:id` | Borrado lógico | ADMIN |
| `GET` | `/creditos/:id/historial` | Bitácora de cambios | Todos |
| `GET` | `/creditos/:id/cuotas` | Plan de amortización con su estado de pago | Todos |
| `POST` | `/creditos/:id/cuotas/:numero/pago` | Registra el pago de una cuota | ANALISTA, ADMIN |
| `GET` | `/creditos/resumen` | Conteo, monto total solicitado y monto aprobado, por estado | Todos |

El `ASOCIADO` solo alcanza sus propios créditos: el repositorio le impone
`WHERE deudor_id = <usuario de la sesión>` en toda consulta.

### Por qué `PATCH` y no `PUT`

`PUT` significa "reemplaza el recurso completo con esto". El crédito tiene campos que el cliente
no puede escribir nunca — `num_credito`, `estado`, `fecha_solicitud`, `row_version` — y otros que
solo puede escribir en ciertos estados. Un `PUT` que descarta la mitad del cuerpo recibido
contradice su propia semántica y confunde a quien integra. `PATCH` describe lo que realmente
ocurre: una modificación parcial.

---

## 2. Registro de una solicitud

```json
POST /api/creditos
{
  "identificacionAsociado": "1001234567",
  "nombreAsociado": "Juan Perez",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 15000000,
  "tasaInteres": 1.5,
  "numeroCuotas": 36,
  "formaPago": "NOMINA"
}
```

Respuesta `201 Created`, con cabecera `Location: /api/creditos/{id}`:

```json
{
  "success": true,
  "data": {
    "id": "9f1c8e2a-...",
    "numeroCredito": "CR-2026-000123",
    "identificacionAsociado": "1001234567",
    "nombreAsociado": "Juan Perez",
    "tipoCredito": "LIBRE_INVERSION",
    "valorSolicitado": 15000000.00,
    "tasaInteres": 1.500000,
    "numeroCuotas": 36,
    "formaPago": "NOMINA",
    "estado": "SOLICITADO",
    "cuotaMensual": 542285.93,
    "diasPromedioPago": null,
    "fechaSolicitud": "2026-09-08T14:03:11.482Z",
    "fechaActualizacion": "2026-09-08T14:03:11.482Z",
    "version": "AAAAAAAAB9E="
  }
}
```

`cuotaMensual` se calcula al vuelo y no se persiste (ver `modulos/03_simulacion.md`). `version`
es el `ROWVERSION` en base64, que el cliente devuelve al modificar.

### El recorrido interno

![Flujo de solicitud de crédito](../diagramas/Flujo%20de%20solicitud%20de%20credito.svg)

En orden, dentro de una sola transacción:

1. Validación del DTO. Si falla, `400` sin abrir transacción.
2. Búsqueda o creación del usuario por identificación.
3. Reglas de dominio: compatibilidad entre tipo de crédito y tipo de persona. Si falla, `422`.
4. Verificación de duplicado. Si falla, `409`.
5. `NEXT VALUE FOR dbo.Seq_NumCredito` y formato del número.
6. `INSERT` en `Creditos` con estado `SOLICITADO`.
7. `INSERT` en `HistorialCredito` con `estado_anterior` nulo.
8. `INSERT` en `Notificaciones` con estado `PENDIENTE`.
9. `COMMIT` y respuesta `201`.

Cualquier fallo revierte la transacción completa.

Los tres `INSERT` viven o mueren juntos. El de `Notificaciones` es el patrón *outbox*: si se
hiciera fuera de la transacción, podría existir un crédito que nadie notificó; si en su lugar se
llamara al sistema externo por HTTP dentro de la transacción, un tercero lento mantendría abierta
una transacción de base de datos. El detalle está en `modulos/05_notificaciones.md`.

### El asociado no se guarda dentro del crédito

La petición trae `identificacionAsociado` y `nombreAsociado`, pero el crédito almacena
`deudor_id`. El servicio resuelve el usuario por identificación dentro de la misma transacción:
si ya existe lo reutiliza —y no sobrescribe su nombre—, y si no, lo crea.

Un asociado tiene varios créditos a lo largo del tiempo. Copiar su nombre en cada fila lo
desincroniza al primer cambio y obliga a actualizar N filas para corregir un dato. Al leer, los
dos campos se devuelven aplanados mediante `JOIN`, de modo que quien consume la API no percibe
la normalización.

---

## 3. Consulta del listado

| Parámetro | Tipo | Defecto | Notas |
|---|---|---|---|
| `page` | entero ≥ 1 | 1 | |
| `limit` | entero 1..100 | 20 | Tope duro |
| `estado` | enum | — | |
| `identificacion` | texto | — | |
| `tipoCredito` | enum | — | |
| `desde` / `hasta` | fecha ISO | — | Rango sobre `fecha_solicitud` |
| `q` | texto | — | Busca por número de crédito o nombre del asociado |
| `sort` | `campo:asc\|desc` | `fechaSolicitud:desc` | Lista blanca de campos |

```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
}
```

Tres decisiones que sostienen esta consulta:

- **`limit` tiene tope de 100.** Sin él, `limit=999999` es una denegación de servicio que no
  cuesta nada montar.
- **`sort` nunca se interpola en el SQL.** Se resuelve contra un mapa fijo de campos permitidos.
  Es el único punto de la consulta donde los parámetros preparados no protegen, porque un nombre
  de columna no puede ir parametrizado, y por tanto el único punto por donde entraría una
  inyección.
- **Siempre excluye `eliminado_en IS NOT NULL`.** El índice `IX_Creditos_Estado_Fecha` está
  filtrado por esa misma condición, así que la consulta lo aprovecha directamente.

`OFFSET/FETCH` degrada en páginas profundas, porque el motor debe recorrer y descartar las filas
anteriores. Es aceptable en el volumen actual; el punto en que conviene cambiar a paginación por
cursor está en `arquitectura/06_escalabilidad.md`.

### 3.1 Resumen

`GET /creditos/resumen` alimenta el tablero con **un solo endpoint**: conteo y monto por estado,
más el monto total solicitado y el monto aprobado. Todo se resuelve en SQL con `SUM(valor_solicitado)`
en el mismo `GROUP BY estado` que ya usa `contarPorEstado`; traer las filas al navegador para
sumarlas no escala igual que el listado.

```json
{
  "success": true,
  "data": {
    "total": 137,
    "porEstado": [
      { "estado": "SOLICITADO", "total": 40 },
      { "estado": "APROBADO", "total": 30 }
    ],
    "montoTotalSolicitado": "450000000.00",
    "montoAprobado": "120000000.00"
  }
}
```

- `montoTotalSolicitado` suma `valor_solicitado` de todos los créditos visibles.
- `montoAprobado` suma `APROBADO` y `DESEMBOLSADO`: un crédito desembolsado fue aprobado antes, y
  contar solo `APROBADO` haría bajar el número cuando el crédito simplemente avanza de estado.
- Sin créditos visibles, ambos montos son `"0.00"`, nunca `null`.
- Aplica el mismo filtro `eliminado_en IS NULL` y el mismo recorte del rol `ASOCIADO` que el resto
  de las consultas de créditos.

---

## 4. Modificación de datos

`PATCH /api/creditos/:id` acepta `tasaInteres`, `numeroCuotas`, `formaPago` y `valorSolicitado`.
Cualquier otro campo en el cuerpo produce `400`.

Exige la cabecera `If-Match` con la versión que el cliente leyó. El caso que resuelve: dos
analistas abren el mismo crédito y ambos reciben la versión `v1`. El primero guarda y la fila
pasa a `v2`. Cuando el segundo intenta guardar, su `UPDATE` lleva `WHERE row_version = v1`, no
afecta ninguna fila y la API responde `409 CONCURRENCIA_CONFLICTO`.

Sin este control, el segundo analista pisa en silencio el trabajo del primero y nadie se entera.
El `UPDATE` condicionado por `row_version` resuelve la detección en la misma operación de
escritura, sin bloqueos ni lecturas previas.

La modificación solo se permite mientras el estado sea `SOLICITADO` o `EN_ESTUDIO`. Después, el
crédito responde `422 CREDITO_INMUTABLE`.

---

## 5. Máquina de estados

![Máquina de estados del crédito](../diagramas/Maquina%20de%20estados%20del%20credito.svg)

| Desde | Destinos permitidos |
|---|---|
| `SOLICITADO` | `APROBADO`, `RECHAZADO`, `CANCELADO` |
| `EN_ESTUDIO` | `APROBADO`, `RECHAZADO`, `CANCELADO` |
| `APROBADO` | `DESEMBOLSADO`, `CANCELADO` |
| `RECHAZADO` | ninguno |
| `DESEMBOLSADO` | ninguno |
| `CANCELADO` | ninguno |

### Por qué `EN_ESTUDIO` dejó de ser un paso

El enunciado propone `EN_ESTUDIO` entre los estados sugeridos y admite otro modelo si se justifica.
Aquí se justifica así: **quien estudia la solicitud es la misma persona que la decide**. Un estado
intermedio que siempre recorre el mismo analista, en la misma sesión y sin aportar información
nueva —no hay bandeja de asignación, ni comité, ni historial crediticio externo que consultar—
no añade control: añade un clic y una fila de bitácora que dice «lo miré», que es exactamente lo
que ya prueba la fila del `APROBADO` con su autor y su fecha.

Un estado solo se gana su sitio si alguien puede quedarse en él. `EN_ESTUDIO` no cumplía eso.

El valor **se conserva en el enum y en el `CHECK`**, y `EN_ESTUDIO` mantiene sus destinos, para
que un crédito registrado antes del cambio pueda terminar su vida con normalidad. Lo que se
elimina es el camino de entrada: `SOLICITADO → EN_ESTUDIO` responde `422 TRANSICION_INVALIDA`.
Si mañana el estudio pasa a manos de un equipo distinto del que aprueba, devolver el paso es
reponer una entrada en la tabla de transiciones.

La tabla se implementa como un `Record<Estado, Estado[]>` constante, no como una cadena de
condicionales. Un mapa se lee de un vistazo, se recorre en una prueba tabular que cubre las 36
combinaciones y se modifica sin tocar lógica.

Un salto no contemplado —por ejemplo `RECHAZADO → DESEMBOLSADO`— responde
`422 TRANSICION_INVALIDA`, y el mensaje enumera los destinos que sí eran posibles desde el
estado actual. Un cambio al mismo estado también se rechaza: no es un cambio y solo ensuciaría
la bitácora.

### Cambio de estado

```json
PATCH /api/creditos/:id/estado
{ "estado": "APROBADO", "observacion": "Cumple capacidad de pago" }
```

Valida la transición, escribe el nuevo estado y, en la misma transacción, inserta la fila de
`HistorialCredito` y la notificación `credito.estado_cambiado`.

La `observacion` es obligatoria al pasar a `RECHAZADO` o `CANCELADO`. Un rechazo sin motivo
registrado deja la bitácora sin capacidad de responder por qué se tomó la decisión, que es
justamente para lo que existe.

### Efectos secundarios de dos transiciones

| Transición | Qué ocurre además, en la misma transacción |
|---|---|
| `* → APROBADO` | Se generan las N filas de `Cuotas` con el plan del motor de amortización. El primer vencimiento es un mes después de la aprobación |
| `APROBADO → CANCELADO` | Las cuotas pendientes pasan a `ANULADA`. No se borran: en este sistema nada se elimina físicamente |

---

## 5.1 Cuotas y comportamiento de pago

Al aprobarse, el crédito deja de ser una solicitud y pasa a tener un plan de pagos concreto.
Ese plan se persiste.

`GET /api/creditos/:id/cuotas` devuelve el plan completo: número, vencimiento, valor, abono a
capital, abono a interés, saldo posterior, estado y —si está pagada— fecha y valor del pago.

`POST /api/creditos/:id/cuotas/:numero/pago` registra un pago:

```json
{ "fechaPago": "2026-10-03", "valorPagado": 542285.93 }
```

Valida que la cuota exista, que esté `PENDIENTE` y que la fecha no sea futura. Marca la cuota
como `PAGADA`.

### Días promedio de pago

`GET /api/creditos/:id` incluye `diasPromedioPago`: cuántos días tarda en promedio el deudor en
pagar la cuota del mes, contados desde el vencimiento.

```sql
SELECT AVG(CAST(DATEDIFF(day, fecha_vencimiento, fecha_pago) AS DECIMAL(9,2)))
FROM dbo.Cuotas
WHERE credito_id = @id AND fecha_pago IS NOT NULL;
```

- **Negativo** → paga antes del vencimiento.
- **Cero** → paga el mismo día.
- **`null`** → todavía no ha pagado ninguna cuota. No es lo mismo que cero, y por eso no se
  devuelve cero.

No se almacena en `Creditos`. El razonamiento completo está en
`arquitectura/02_modelo_de_datos.md` §1.1, y se resume así: un promedio es un resultado, y
guardarlo como columna produce un número que nadie puede recalcular ni auditar. Persistiendo
las cuotas, el dato se reconstruye siempre y de paso quedan disponibles el saldo pendiente, la
próxima cuota a vencer y la mora.

---

## 6. Borrado lógico

`DELETE /api/creditos/:id` ejecuta `UPDATE ... SET eliminado_en = SYSUTCDATETIME()` y devuelve
`204 No Content`. La fila permanece.

**`eliminado_en` no es un estado del crédito**, y por eso es una columna aparte en lugar de un
valor más del enum:

- `CANCELADO` es un hecho del negocio: el asociado desistió, o la entidad retiró la oferta.
- `eliminado_en` es un hecho administrativo: la fila se oculta de los listados operativos.

Si se fusionaran, la pregunta "¿cuántos créditos se cancelaron este mes?" dejaría de tener una
respuesta única. Además, en un sistema financiero los registros son evidencia y suelen estar
sujetos a retención obligatoria, así que el borrado físico no es una opción.

Consultar un crédito borrado devuelve `404`, no `410`: para quien consume la API no existe, y
distinguir "nunca existió" de "fue borrado" entrega información a quien no debería tenerla.

---

## 7. Reglas de negocio y dónde vive cada una

El sistema valida en tres capas, deliberadamente redundantes.

| Capa | Qué verifica | Respuesta |
|---|---|---|
| **DTO** | Tipos, enums, obligatoriedad, rangos sintácticos | 400 |
| **Servicio** | Compatibilidad tipo de crédito / tipo de persona, transiciones, duplicados, inmutabilidad | 409, 422 |
| **Base de datos** | `valor > 0`, `tasa >= 0`, `cuotas > 0`, unicidad anti-duplicado | 409 traducido |

La redundancia es intencional. La base de datos no puede ser el único candado porque no produce
mensajes utilizables y no expresa reglas que cruzan tablas. El DTO no puede ser el único porque
cualquier otro proceso que escriba en la base —una carga masiva, un script de corrección— la
dejaría inconsistente. Las reglas críticas se verifican en las tres.

### Definición de crédito duplicado

> Una solicitud es duplicada si existe otra del **mismo deudor**, del **mismo tipo** y por el
> **mismo valor**, que siga **viva** (`SOLICITADO` o `EN_ESTUDIO`) y no esté borrada.

El caso real que ataca es el doble clic en el botón de enviar, o el reintento automático de una
petición que sí llegó. Ese duplicado siempre tiene los mismos tres campos y ocurre en segundos.
En cambio, que un asociado pida dos créditos de libre inversión por montos distintos, o el mismo
monto un año después de pagar el anterior, es negocio legítimo — por eso el criterio ignora los
estados terminales.

Se verifica **dos veces**: en el servicio, para poder responder un `409` con un mensaje que
explique qué pasó, y con un índice único filtrado en la base, porque entre el `SELECT` de
verificación y el `INSERT` hay una ventana en la que dos peticiones concurrentes pasan ambas la
comprobación. El índice cierra esa ventana.

### Compatibilidad entre producto y perfil

Derivadas del modelo de negocio descrito en `dominio/01_conceptos_de_credito.md`:

| Regla | Fundamento |
|---|---|
| `COMERCIAL` exige `PERSONA_JURIDICA` | El crédito empresarial no se otorga a personas naturales |
| `LIBRE_INVERSION`, `LIBRANZA`, `HIPOTECARIO`, `VEHICULO` exigen `PERSONA_NATURAL` | Son productos de banca personal |
| `MICROCREDITO` admite ambos perfiles | Cubre microempresarios formales e informales |
| `LIBRANZA` exige `formaPago = NOMINA` | Es la definición del producto: se descuenta de la nómina |
| `numeroCuotas` dentro del rango del tipo | Consumo hasta 72, hipotecario hasta 240, microcrédito hasta 36 |

Todas viven en el servicio y ninguna en la base de datos, porque cruzan `Creditos` con
`Usuarios`. Un `CHECK` de SQL Server solo puede mirar la fila que se está escribiendo; alcanzar
otra tabla exigiría un trigger o una función escalar, dos mecanismos que esconden lógica de
negocio donde nadie la busca y que se ejecutan por fila sin que el código lo evidencie.

---

## 8. Qué se puede modificar y qué no

| Dato | Modificable | Condición |
|---|---|---|
| `credito_id`, `num_credito` | No | Identidad del acuerdo, con referencias externas |
| `deudor_id` | No | Cambiar el deudor es otro crédito, no una corrección |
| `fecha_solicitud` | No | Es un hecho ocurrido en un instante |
| `valor_solicitado`, `tasa_interes`, `num_cuotas`, `forma_pago` | Sí | Solo en `SOLICITADO` o `EN_ESTUDIO` |
| `estado` | Sí | Solo por `PATCH /estado`, con transición válida e historial |
| `eliminado_en` | Sí | Solo por `DELETE`; nunca vuelve a nulo |
| Filas de `HistorialCredito` | No | La bitácora es append-only |

El principio que ordena la tabla: **los hechos son inmutables; los datos vigentes son
modificables.** Que un crédito se aprobó por 15 millones al 1,5 % es un hecho. El nombre actual
del asociado es un dato vigente.

De ahí se sigue algo que no es obvio: si el negocio necesita cambiar las condiciones de un
crédito ya aprobado, la operación correcta no es editarlo, sino anularlo y emitir uno nuevo que
lo referencie. Es el mismo razonamiento contable de la nota crédito — no se borra la factura, se
emite un documento que la corrige. El detalle está en `modulos/04_auditoria.md`.

---

## 9. Generación del número de crédito

El formato es `CR-{año}-{consecutivo de 6 dígitos}`, por ejemplo `CR-2026-000123`.

El consecutivo sale de una secuencia de base de datos (`NEXT VALUE FOR dbo.Seq_NumCredito`),
solicitada dentro de la transacción de creación. Calcularlo con `SELECT MAX(...) + 1` produce
números repetidos en cuanto hay dos peticiones concurrentes, y la restricción de unicidad
convertiría eso en errores 500 esporádicos y difíciles de reproducir.

---

## 10. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| `PATCH` en lugar de `PUT` | La semántica coincide con el comportamiento real | Quien espera `PUT` debe adaptarse |
| Asociado normalizado en `Usuarios` | Un solo lugar por dato; sin desincronización | Un `JOIN` en cada lectura y un *find-or-create* en la escritura |
| Duplicado verificado en servicio y en índice | Mensaje útil y garantía real bajo concurrencia | La regla queda escrita en dos sitios |
| Concurrencia optimista con `ROWVERSION` | Sin bloqueos; el conflicto se detecta al escribir | El cliente debe manejar el `409` y reintentar |
| Borrado lógico | Nada se pierde; cumple retención | Toda consulta debe recordar el filtro |
| Reglas producto/perfil en el servicio | Visibles, probables y con mensaje propio | La base de datos no las hace cumplir |
| `EN_ESTUDIO` fuera del flujo, conservado en el enum | Un estado menos que recorrer sin que nadie pueda quedarse en él; los créditos anteriores siguen cerrándose | El enum guarda un valor que ya no se alcanza; volver a usarlo exige reponer la transición |
| El catálogo de productos se filtra por perfil en la vista | A una persona natural no se le ofrece el crédito comercial: el 422 deja de ser la primera noticia | La política de perfiles queda espejada en el cliente, y hay que moverla en dos sitios |
