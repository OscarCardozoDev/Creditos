# Estrategia de Pruebas

Qué se verifica automáticamente, con qué herramienta y por qué en ese nivel.

---

## 1. Reparto

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| **Unitarias** | Jest, sin infraestructura | Motor de cálculo, máquina de estados, reglas de dominio |
| **Extremo a extremo** | Supertest contra SQL Server real | Contrato de la API, transacciones, restricciones de la base, sesiones y permisos |
| **Integración externa** | Supertest, con el receptor apagado | Bandeja de salida, receptor del webhook, firma e idempotencia |

Cada cosa se prueba en el nivel más barato donde la prueba sigue siendo significativa. El motor
de cálculo no necesita base de datos; el índice único anti-duplicado no se puede verificar sin
ella.

---

## 2. Por qué las pruebas de extremo a extremo usan SQL Server real

Buena parte de las garantías del sistema son restricciones del motor: el índice único filtrado,
las restricciones `CHECK`, `ROWVERSION`, la validación de JSON, el comportamiento transaccional.

Contra una base embebida como SQLite, todas esas pruebas pasarían **sin ejercitar nada**: el
motor sustituto no implementa índices filtrados ni `ROWVERSION`, así que las pruebas verificarían
un comportamiento que no es el de producción. Un contenedor efímero es más lento y es la única
forma de probar lo que realmente se construyó.

La suite arranca la base vacía y aplica las migraciones antes del primer caso. Efecto secundario
valioso: **cada ejecución valida también las migraciones**, y una migración rota falla en
integración continua en lugar de durante un despliegue.

---

## 3. Pruebas unitarias

### Motor de cálculo

| Caso | Verifica |
|---|---|
| Francés: 15.000.000 / 1,5 % / 36 → cuota 542.285,93 | Fórmula |
| Alemán: mismos datos → capital 416.666,67; cuota 1 = 641.666,67 | Fórmula |
| 18 % efectiva anual → 1,3888430 % mensual | Conversión de tasas |
| Tasa cero → cuota = capital / cuotas | Borde: sin división entre cero |
| Una sola cuota → cuota = capital × (1 + tasa) | Borde |
| `suma(capital) === P` y `saldo_final === 0`, ambos sistemas | Invariante de redondeo |

El último caso es el de mayor rendimiento por línea escrita: falla ante cualquier error de
redondeo en cualquiera de los dos sistemas.

### Máquina de estados

Una tabla que recorre las 36 combinaciones de estado origen y destino, afirmando cuáles se
permiten. Cubre por construcción todos los saltos inválidos, incluido `RECHAZADO → DESEMBOLSADO`,
y se escribe en pocas líneas porque la máquina es un mapa de datos y no una cadena de
condicionales.

### Reglas de dominio

Compatibilidad entre tipo de crédito y tipo de persona, rangos de cuotas por producto, bandas de
tasa y obligatoriedad de observación al rechazar o cancelar.

---

## 4. Pruebas de extremo a extremo

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Registro válido de solicitud | 201, con identificador y número de crédito, estado `SOLICITADO` |
| 2 | Valor solicitado negativo | 400 `VALIDATION_ERROR` |
| 3 | Número de cuotas en cero | 400 |
| 4 | Crédito comercial para persona natural | 422 `REGLA_NEGOCIO` |
| 5 | Segunda solicitud equivalente en trámite | 409 `CREDITO_DUPLICADO` |
| 6 | Consulta de un identificador inexistente | 404 `CREDITO_NOT_FOUND` |
| 7 | Transición `SOLICITADO → APROBADO` | 200, una fila nueva en el historial y el plan de cuotas generado |
| 7b | Transición `SOLICITADO → EN_ESTUDIO` | 422 `TRANSICION_INVALIDA`: el estudio ya no es un paso |
| 8 | Transición `RECHAZADO → DESEMBOLSADO` | 422 `TRANSICION_INVALIDA` |
| 9 | Rechazo sin observación | 400 |
| 10 | Edición con versión obsoleta en `If-Match` | 409 `CONCURRENCIA_CONFLICTO` |
| 11 | Edición de un crédito ya aprobado | 422 `CREDITO_INMUTABLE` |
| 12 | Borrado lógico y consulta posterior | 204, luego 404 |
| 13 | Listado con filtro y paginación | 200, con `meta` coherente y solo los créditos del estado pedido |
| 14 | Petición sin cookie de sesión | 401 `NO_AUTENTICADO` |
| 15 | Escritura sin cabecera anti-CSRF | 403 `CSRF_INVALIDO` |
| 16 | Asociado consultando un crédito ajeno | 403 |
| 17 | Sesión revocada y petición posterior | 401 `SESION_REVOCADA` |
| 18 | Sesión pasada del vencimiento absoluto | 401 `SESION_EXPIRADA` |

Los casos 14 a 18 son los que verifican que la decisión de usar sesiones de servidor entrega lo
que promete: el 17 en particular comprueba la revocación inmediata, que es la razón de haberla
elegido.

---

## 5. Pruebas de la integración externa

`api/test/notificaciones.e2e-spec.ts`. La suite corre con `WEBHOOK_URL` apuntando a un receptor
que no existe, así que **el escenario "el tercero está caído" no hay que montarlo: es la condición
por defecto**. Eso convierte el caso 3 en la prueba más directa posible de la propiedad central
del diseño.

| # | Caso | Verifica |
|---|---|---|
| 1 | Registrar un crédito deja una fila `credito.creado` con el `credito_id` y el `payload` correctos | La bandeja de salida se escribe dentro de la transacción del alta |
| 2 | Cambiar el estado deja una segunda fila `credito.estado_cambiado`, con estado anterior y nuevo | El evento acompaña también a la transición |
| 3 | **Con el receptor inalcanzable, el crédito se registra igual y queda consultable; su notificación nunca llega a `ENVIADO`** | **Desacoplamiento real: la caída de un tercero no interrumpe la operación** |
| 4 | Un evento firmado por el receptor registra el crédito y aparece en el listado normal, con su propia fila en la bandeja | El receptor delega en `CreditosService.crear()`; no hay segunda ruta de alta |
| 5 | El mismo `eventId` dos veces responde `procesado: false` y deja un solo crédito | Idempotencia por clave primaria en `EventosWebhookRecibidos` |
| 6 | Una firma que no corresponde al cuerpo responde `401 FIRMA_INVALIDA` | La firma HMAC es la única credencial del receptor |
| 7 | Un evento de hace una hora responde `401` aunque la firma sea válida | Vigencia de 5 minutos: la firma sola no detiene una reproducción |
| 8 | Un evento que incumple una regla de negocio responde `422` **las dos veces** | La marca de idempotencia se libera al fallar `crear()`: un reintento legítimo puede progresar |

La firma se recalcula dentro de la prueba con `node:crypto`, en vez de importar `firmar()` de
`src/`. Reusar la misma función en las dos puntas haría que un cambio de algoritmo pasara verde
sin que nadie lo notara.

**Lo que no está automatizado**, y por qué: que dos réplicas concurrentes no entreguen el mismo
evento dos veces. La reclamación atómica (`UPDATE ... OUTPUT` con `READPAST`,
`arquitectura/07_webhook.md §2`) exige levantar dos instancias de la API contra la misma base y
provocar el solape; el costo de montarlo supera lo que aporta frente a la garantía de "al menos
una vez", que el receptor ya tolera por `eventId`. El espaciado de reintentos y la distinción
entre 4xx y 5xx sí están cubiertos, en las unitarias de `reintentos.spec.ts`.

---

## 6. Aislamiento entre pruebas

Cada archivo de pruebas de extremo a extremo trabaja sobre datos propios: identificaciones de
asociado distintas por archivo, o transacción con reversión al terminar.

Las pruebas que dependen del orden de ejecución fallan de forma intermitente, y una prueba
intermitente termina siendo ignorada, que es peor que no tenerla.

El contenedor de base para pruebas es distinto del de desarrollo, para que ejecutar la suite no
borre los datos con los que se está trabajando.

---

## 7. Alcance

**No hay pruebas automatizadas de interfaz.** El esfuerzo se concentra donde están las reglas de
negocio y las garantías transaccionales. Las regresiones visuales se detectan usando la
aplicación.

Extensiones previstas, no implementadas: pruebas de carga para validar los supuestos de
`arquitectura/06_escalabilidad.md`, y pruebas de contrato contra la especificación de la API para
detectar cambios incompatibles antes de publicarlos.

---

## 8. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Base real en las pruebas de integración | Se verifica lo que de verdad protege los datos | Suite más lenta y con dependencia de Docker |
| Migraciones dentro de la suite | Cada ejecución valida el esquema | Tiempo de arranque en cada corrida |
| Pruebas tabulares para la máquina de estados | Cobertura completa con poco código | Solo es posible porque la máquina es un mapa de datos |
| Sin pruebas de interfaz | Menos superficie que mantener | Las regresiones visuales se descubren manualmente |
| Aislamiento por datos propios | Sin fallas intermitentes | Cada archivo debe preparar su propio escenario |
