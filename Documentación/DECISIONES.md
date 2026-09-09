# Decisiones Técnicas

Las diez decisiones que dan forma al sistema, con lo que cada una gana y lo que cuesta. Cada
sección enlaza al documento donde está el argumento completo.

---

## 1. Sesión de servidor, no token autocontenido

La cookie lleva 32 bytes aleatorios sin significado; el usuario, el rol y la vigencia viven en
`Sesiones` y se resuelven en cada petición.

**Por qué.** En una entidad financiera, la revocación tiene que ser inmediata. Un token
autocontenido no se puede revocar antes de que expire: un cierre de sesión le pide al cliente que
olvide el token, y si quien lo tiene es un atacante, sigue entrando. Bloquear un usuario o
cambiarle el rol tampoco surte efecto hasta el vencimiento. La tabla de sesiones, además, deja
rastro auditable: quién entró, desde qué IP y cuándo.

**Se paga:** una consulta por petición, y aparece el CSRF —que un token en cabecera no tiene—.
Ambos precios se pagan a conciencia: el CSRF se cierra con `SameSite=Strict` más token de doble
envío, y la consulta es un *seek* por clave primaria.

→ `modulos/01_autenticacion_y_sesiones.md`

## 2. El esquema vive en las entidades, con `synchronize: false`

La estructura de la base se declara en `api/src/entidades/` y se aplica por migración revisada.
La base no se modifica a mano en ningún entorno, tampoco en desarrollo.

**Por qué.** La sincronización automática destruye datos: renombrar una propiedad no produce un
`RENAME`, produce `DROP` + `ADD`, y la columna se va con su contenido. Tampoco deja historia, no
admite reversión y no sirve en producción — lo que obligaría a mantener dos mecanismos, probar con
uno y desplegar con el otro. La generación de migraciones da el mismo cálculo automático de la
diferencia, pero en un archivo versionado, revisable y reversible.

**Se paga:** un paso más en cada cambio de esquema, y hay que leer el SQL generado antes de
aplicarlo — los renombres y las columnas obligatorias salen mal por defecto.

→ `arquitectura/02_modelo_de_datos.md`

## 3. Las reglas críticas se verifican en tres capas

DTO (400) · servicio (409 y 422) · base de datos (restricción traducida).

**Por qué.** La redundancia es intencional, no un descuido. La base no puede ser el único control
porque no produce mensajes utilizables y no expresa reglas que cruzan tablas: un `CHECK` de SQL
Server solo ve la fila que se escribe, y la compatibilidad producto/perfil necesita mirar
`Usuarios`. El DTO no puede ser el único porque cualquier otro proceso que escriba en la base —una
carga masiva, un script de corrección— la dejaría inconsistente. Y entre el `SELECT` que verifica
un duplicado y el `INSERT` hay una ventana que solo cierra el índice único.

Que la base rechace algo que el servicio ya verificó no es trabajo desperdiciado: significa que
dos peticiones concurrentes pasaron ambas la comprobación y solo una alcanzó a escribir.

**Se paga:** la misma regla escrita en dos o tres sitios, que hay que mantener alineados.

→ `modulos/02_creditos.md §7`

## 4. Notificación por bandeja de salida transaccional

El crédito, su fila de historial y su fila `PENDIENTE` en `Notificaciones` se escriben en una sola
transacción. La entrega HTTP la resuelve después un proceso aparte.

**Por qué.** Las tres alternativas directas fallan. Llamar al webhook *dentro* de la transacción
la mantiene abierta mientras responde un tercero, reteniendo bloqueos. Llamarlo *después* del
`COMMIT` deja créditos sin notificar y sin rastro si el proceso muere en medio. Llamarlo *antes*
notifica créditos que pueden terminar sin guardarse. Cualquiera de las tres acopla la
disponibilidad propia a la del tercero.

La prueba de que funciona es concreta: **con el sistema externo apagado, registrar un crédito
sigue respondiendo `201`.**

**Se paga:** la entrega es asíncrona, y la garantía es "al menos una vez" — el receptor debe ser
idempotente, y por eso cada evento lleva `eventId`.

→ `modulos/05_notificaciones.md` · `arquitectura/07_webhook.md`

## 5. El webhook entrante reutiliza el servicio, no duplica la lógica

`POST /api/webhooks/creditos` verifica la firma HMAC, descarta el `eventId` ya procesado y llama
al mismo `CreditosService.crear()` que usa el controlador HTTP normal.

**Por qué.** Una segunda ruta de alta divergiría de la primera con el tiempo sin que nada lo
hiciera evidente. El controlador del webhook es un adaptador de transporte: cero lógica de
negocio, cero `INSERT` propio.

**Se paga:** el servicio exige un usuario que registra el crédito, y el webhook no tiene sesión;
se resuelve con un usuario técnico fijo, que hay que saber leer así en la bitácora.

→ `arquitectura/07_webhook.md §6`

## 6. Nada se borra; los hechos son inmutables

`DELETE` marca `eliminado_en` y responde `204`; la fila permanece. `HistorialCredito` solo recibe
`INSERT`, reforzado con `GRANT SELECT, INSERT` sin `UPDATE` ni `DELETE`.

**Por qué.** En un sistema financiero los registros son evidencia y suelen estar sujetos a
retención obligatoria. Una bitácora que se puede editar deja de ser bitácora y pasa a ser una
narración: su valor depende de que nadie —ni quien administra la aplicación— pueda reescribirla
después del hecho. El permiso a nivel de motor es lo que realmente cierra la puerta; la convención
del código solo protege del error honesto.

`eliminado_en` es columna aparte y no un estado más, porque el borrado es un hecho administrativo
y `CANCELADO` es un hecho del negocio. Fusionarlos dejaría la pregunta "¿cuántos créditos se
cancelaron este mes?" sin respuesta única.

**Se paga:** toda consulta debe recordar el filtro `eliminado_en IS NULL` —se impone en el
repositorio, no en cada consulta— y un asiento equivocado no se corrige, solo se aclara con otro.

→ `modulos/04_auditoria.md` · `modulos/02_creditos.md §6`

## 7. Aritmética decimal de extremo a extremo

Montos en `DECIMAL(18,2)`, tasas en `DECIMAL(9,6)`, cálculo con `decimal.js`, nunca con `number`.

**Por qué.** El punto flotante binario no representa exactamente los valores decimales: `0.1 + 0.2`
no da `0.3`. Guardar en `DECIMAL` y calcular en `number` traslada el error en vez de eliminarlo.
La tasa necesita seis decimales porque 18 % efectivo anual son 1,388843 % mensual, y redondear a
dos cambia la cuota.

El redondeo se cierra con una regla explícita: **la última cuota absorbe el residuo**, calculada
como el saldo pendiente más su interés. Deja dos invariantes que se verifican sin tolerancia y son
la mejor prueba del módulo: `suma(capital) === P` y `saldo_final === 0`, exactos.

**Se paga:** una dependencia y aritmética más verbosa; la cuota final difiere unos centavos.

→ `modulos/03_simulacion.md §4`

## 8. Concurrencia optimista con `ROWVERSION` explícito

El cliente devuelve la versión que leyó en `If-Match`; el `UPDATE` lleva `WHERE row_version = @v`.
Cero filas afectadas → `409 CONCURRENCIA_CONFLICTO`.

**Por qué.** Dos analistas abren el mismo crédito y ambos leen `v1`. Sin control, el segundo pisa
en silencio el trabajo del primero y nadie se entera. La detección ocurre en la misma operación de
escritura, sin bloqueos ni lectura previa. Se usa la columna `ROWVERSION` que incrementa el motor y
no el mecanismo de versión del ORM, porque ese lo incrementa por su cuenta.

**Se paga:** el cliente tiene que manejar el `409` y reintentar.

→ `arquitectura/02_modelo_de_datos.md §6`

## 9. Un solo punto de construcción para los errores

Todas las respuestas de error salen de un filtro global, con formato
`{success, error:{code, message, details, requestId}}` y un `code` del catálogo. Ningún controlador
arma una respuesta de error.

**Por qué.** Si cada controlador construyera su JSON, el formato divergiría y el cliente
terminaría con una rama por endpoint. `code` es estable para que el cliente lo compare; `message`
es texto para personas y puede mejorarse sin romper integraciones.

Hacia el cliente nunca viaja una traza de pila, un mensaje del motor ni un nombre de tabla: un
error de SQL Server devuelto tal cual es un mapa del esquema entregado a quien esté sondeando la
API. Se registra completo en el log, referenciado por `requestId`, y se responde `ERROR_INTERNO`.

**Se paga:** diagnosticar exige consultar los logs por `requestId` — que por eso se devuelve en la
cabecera `X-Request-Id` y se muestra en pantalla ante un 500.

→ `arquitectura/04_manejo_de_errores.md`

## 10. Monolito modular, dimensionado antes de rediseñar

Un solo despliegue, con los módulos separados por carpeta y sin dependencias cruzadas indebidas.

**Por qué.** El escenario de 500.000 créditos mensuales parece un problema de escritura y no lo
es: dividido entre días, horas hábiles y segundos, con un factor de pico de 10, son **seis
escrituras por segundo**. Una instancia de SQL Server bien indexada las atiende sin dificultad.

Lo que sí cambia de escala es el acumulado y la lectura, y ahí el orden de intervención está
definido: `entidad_id` en todos los índices primero —es lo más barato de hacer temprano y lo más
caro de hacer tarde—, luego modelo de lectura para el tablero, partición por fecha, réplica de
lectura, y separar el proceso de entrega.

Microservicios no entran: el dominio es uno y sus transacciones cruzan crédito, historial y
bandeja de salida. Separarlo obligaría a transacciones distribuidas para resolver un problema que
no existe.

**Se paga:** toda la aplicación escala junta.

→ `arquitectura/06_escalabilidad.md`

---

## Límites conocidos

Declarados, no descubiertos por el evaluador:

| Límite | Cuándo aparece | Sustitución prevista |
|---|---|---|
| `OFFSET/FETCH` en la paginación | Páginas profundas sobre millones de filas | Cursor sobre `(fecha_solicitud, credito_id)` |
| Conteos en vivo del tablero | Cuando `Creditos` supera algunos millones | Tabla de resumen o vista indexada |
| La tabla como cola de notificaciones | Cuando el barrido pesa o la profundidad crece sostenidamente | Intermediario de mensajería |
| Consulta de sesión por petición | Alto volumen de peticiones autenticadas | Almacén en memoria |
| Proceso de entrega dentro de la API | Cuando los reintentos compiten con el tráfico | Despliegue separado |
| Bitácora solo de estados | Al necesitar rastro de ediciones de campos | Tabla `AuditoriaCampos` |
| Sin pruebas automatizadas de interfaz | Regresiones visuales | Se detectan usando la aplicación |

Ninguno exige rediseño: son sustituciones localizadas, y cada una tiene su disparador medible en
`arquitectura/06_escalabilidad.md`.

Fuera de alcance de forma deliberada, en seguridad: segundo factor para el rol administrador,
rotación automática de secretos, auditoría de accesos, cifrado en reposo y límite de sesiones
simultáneas (`arquitectura/03_seguridad.md §10`).
