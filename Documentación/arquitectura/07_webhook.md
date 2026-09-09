# Webhook: mecanismo y recorrido

Cómo funciona, en la práctica, la entrega de eventos a un sistema externo y la recepción de
eventos desde uno. El contrato del evento, el catálogo de estados y las tablas de reintentos ya
están en `modulos/05_notificaciones.md`; este documento no los repite, los enlaza y explica el
recorrido completo y los mecanismos que lo sostienen.

---

## 1. El recorrido de un evento, de punta a punta

1. Un asociado o un analista registra un crédito. `CreditosService.crear()` abre una transacción,
   inserta el crédito, su fila de `HistorialCredito` y una fila `PENDIENTE` en `Notificaciones`
   con el JSON exacto que se va a enviar. Las tres escrituras viven o mueren juntas.
2. La petición HTTP responde `201` en cuanto la transacción hace `COMMIT`. Nada de lo que pase
   después con el sistema externo afecta esa respuesta.
3. Un intervalo programado (`EntregaTarea`, con `@nestjs/schedule`) dispara cada
   `WORKER_INTERVALO_MS` un barrido de `EntregaService.entregarPendientes()`.
4. El barrido primero rescata lo atascado (§3), luego reclama un lote de filas `PENDIENTE` de
   forma atómica (§2) y hace un `POST` firmado por cada una.
5. Según la respuesta, la fila termina `ENVIADO`, vuelve a `PENDIENTE` con un `proximo_intento`
   futuro, o queda `FALLIDO` (§4 de `modulos/05_notificaciones.md`).
6. Si del otro lado hay un receptor propio (`POST /api/webhooks/creditos`), ese controlador
   verifica la firma y el `eventId`, y delega en el mismo `CreditosService.crear()` que usa la
   API para sus propias altas (§5).

Ningún paso de este recorrido depende de que el paso siguiente ocurra pronto. Es exactamente lo
que permite el punto 2: la disponibilidad del sistema externo nunca decide si un crédito se
registra.

---

## 2. Por qué la reclamación tiene que ser atómica

Con una sola instancia de la API, un `SELECT` de pendientes seguido de un `UPDATE` alcanzaría.
Con dos o más réplicas corriendo el mismo intervalo —el caso normal en producción, ver
`05_despliegue.md`— ese patrón deja una ventana: ambas leen la misma fila `PENDIENTE` antes de
que ninguna la marque, y el evento sale duplicado por partida doble.

`NotificacionesRepository.reclamarPendientes()` cierra esa ventana con una sola sentencia:

```sql
UPDATE TOP (50) dbo.Notificaciones WITH (ROWLOCK, READPAST)
SET estado = 'ENVIANDO', intentos = intentos + 1
OUTPUT inserted.*
WHERE estado = 'PENDIENTE'
  AND (proximo_intento IS NULL OR proximo_intento <= SYSUTCDATETIME());
```

Dos cosas hacen el trabajo:

- **`UPDATE ... OUTPUT`** reclama y lee en la misma operación. No hay instante intermedio en el
  que otra réplica pueda ver la fila todavía como `PENDIENTE`.
- **`READPAST`** hace que una réplica que choca con una fila ya bloqueada por otra la **salte**,
  en vez de esperar el bloqueo. Sin esto, dos réplicas reclamando al mismo tiempo se turnarían en
  vez de trabajar en paralelo, y el barrido de una bloquearía al de la otra por nada: cada fila
  solo la puede tener una réplica de todos modos.

El resultado: cada fila la entrega exactamente una réplica por intento, sin coordinación externa
y sin que las réplicas necesiten saber unas de otras.

---

## 3. Filas atascadas: qué pasa si el proceso muere a mitad del envío

Entre que una réplica reclama una fila (`ENVIANDO`) y la cierra (`ENVIADO`, `FALLIDO` o de vuelta
a `PENDIENTE`), el proceso puede morir: un despliegue, un `OOM kill`, un reinicio del contenedor.
Esa fila queda en `ENVIANDO` para siempre si nada la recupera, porque `reclamarPendientes()` solo
mira filas `PENDIENTE`.

`rescatarAtascadas(minutos)` corre al principio de cada barrido y devuelve a `PENDIENTE` lo que
lleva más de `N` minutos en `ENVIANDO`:

```sql
UPDATE dbo.Notificaciones SET estado = 'PENDIENTE'
WHERE estado = 'ENVIANDO' AND creado_en <= DATEADD(MINUTE, -N, SYSUTCDATETIME());
```

Usa `creado_en` porque la entidad no lleva una columna separada para "cuándo entró en
`ENVIANDO`". Es una aproximación, no una medición exacta: una fila que estuvo horas en `PENDIENTE`
(el sistema externo caído, ver `modulos/05_notificaciones.md §4`) y se reclama justo antes de que
otra réplica muera, puede rescatarse más rápido de lo estrictamente necesario. La consecuencia es,
como mucho, un envío duplicado — algo que la garantía "al menos una vez" (§4) ya contempla y que
el receptor ya debe tolerar por el `eventId`. Se documenta aquí en vez de resolverse con una
columna nueva porque el costo de la imprecisión es menor que el de un esquema más grande para un
caso límite.

---

## 4. Reintentos: "al menos una vez" y por qué hace falta `eventId`

La entrega no garantiza "exactamente una vez": si el receptor procesa el evento pero la respuesta
se pierde en la red antes de llegar, el emisor no tiene forma de saberlo y reintenta. Sobre una
red no confiable, exactamente-una-vez no existe sin una coordinación que esta arquitectura
deliberadamente no paga (ver `Decisiones` en `05_despliegue.md`).

Por eso cada evento lleva un `eventId` estable, generado una sola vez cuando se escribe en la
bandeja de salida. El emisor lo manda siempre igual en cada reintento del mismo evento
(`X-Event-Id` en la cabecera), y es responsabilidad del **receptor**, no del emisor, usarlo para
no procesar dos veces lo mismo. El emisor solo puede garantizar la entrega; la idempotencia la
resuelve quien recibe.

`esTransitorio(status)` (en `notificaciones/reintentos.ts`) separa lo que vale la pena reintentar
de lo que no: `5xx`, `408` y `429` sí; el resto de `4xx` no, porque repetir la misma petición mal
formada da el mismo error para siempre. `proximoIntento(intentos)` calcula el siguiente intento
con retroceso exponencial (1 s, 2 s, 4 s, 8 s…, con un tope) más una dispersión aleatoria. La
dispersión no es cosmética: sin ella, todos los eventos que se acumularon mientras el sistema
externo estaba caído le caen encima en el mismo instante apenas se recupera, y lo vuelven a
tumbar — el propio mecanismo de reintento se convierte en la causa de la siguiente caída.

---

## 5. La firma, en los dos sentidos

**Saliente.** `EntregaService.enviar()` firma el cuerpo con `firmar(payload, secreto)`
(`notificaciones/firma.ts`): `HMAC-SHA256` sobre la cadena exacta que se envía, en la cabecera
`X-Signature`. Es la cadena exacta y no un objeto que se vuelve a serializar: `payload` ya es el
JSON tal como se guardó, y firmar cualquier otra representación de "los mismos datos" produciría
una firma que el receptor no podría verificar, porque el `JSON.stringify` de un objeto no es
determinista entre lenguajes ni entre versiones.

**Entrante.** El receptor (`FirmaWebhookGuard`) hace la verificación inversa, y en un orden que
importa:

1. **Firma sobre el cuerpo crudo, antes de parsear.** `main.ts` guarda el `Buffer` original en
   `req.rawBody` durante el middleware de `express.json()`, con su opción `verify`. Si se firmara
   el objeto ya parseado y reserializado, cualquier diferencia de formato (orden de claves,
   espacios) invalidaría una firma legítima.
2. **Comparación en tiempo constante** (`firmasIguales`, con `timingSafeEqual`). Comparar con
   `===` filtra, por el tiempo que tarda la comparación, cuántos caracteres iniciales coinciden:
   suficientes intentos permiten reconstruir la firma esperada byte a byte.
3. **Vigencia de 5 minutos.** La firma por sí sola no basta contra la reproducción: alguien que
   intercepta un evento legítimo (o que tiene acceso a un log viejo) puede reenviarlo tal cual, y
   la firma seguirá siendo válida porque el cuerpo no cambió. Comparar el `timestamp` del evento
   contra la hora actual cierra esa ventana.

Sin sesión ni cookie, la firma **es** la autenticación del receptor: por eso la ruta está marcada
`@Publico()` (exime al `SesionGuard`, y el `CsrfGuard` también la deja pasar por la misma marca:
un POST protegido por HMAC no necesita, ni podría cumplir, el token de doble envío pensado para un
navegador con sesión).

---

## 6. El receptor: adaptador de transporte, no una segunda ruta de negocio

`POST /api/webhooks/creditos` no reimplementa ninguna regla de creación de crédito. Verifica la
firma y la vigencia (guard, §5), descarta el evento si su `eventId` ya se procesó, y llama a
`CreditosService.crear()` — el mismo método que usa el controlador HTTP normal. Si hubiera una
segunda lógica de alta, las dos rutas divergirían con el tiempo sin que nada lo hiciera evidente.

La idempotencia usa una tabla propia, `EventosWebhookRecibidos`, con `event_id` como llave
primaria: un `INSERT` que choca contra esa llave es la señal de que el evento ya se vio, sin
necesidad de un `SELECT` previo ni de una ventana entre comprobar y marcar. Se descartó reutilizar
`Notificaciones` para esto: esa tabla guarda los eventos que **la propia API emite** (con un
`eventId` que ella genera), no los que recibe de afuera, así que no hay ninguna fila ahí que
corresponda al `eventId` que manda el emisor externo.

La marca se escribe **antes** de llamar a `crear()`, para que dos entregas simultáneas del mismo
evento no pasen ambas el filtro. Pero si `crear()` falla — una regla de negocio, una validación,
lo que sea — la marca se libera antes de propagar el error. Sin este detalle, un evento que falla
por una causa real (no un duplicado) quedaría marcado como "ya procesado" para siempre, y un
reintento legítimo del emisor recibiría un falso `200` sin que el crédito se hubiera creado nunca.

`CreditosService.crear()` exige un usuario que "registra" el crédito, para la bitácora y para las
reglas de tasa. El webhook no tiene sesión, así que usa un usuario técnico fijo (identificación
`000000000`, rol `ANALISTA`) que se crea la primera vez que hace falta. El rol importa: el
repositorio de créditos solo filtra por deudor cuando quien pide es `ASOCIADO`, y este usuario
técnico nunca es el deudor del crédito que está registrando.

---

## 7. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| `rescatarAtascadas` usa `creado_en`, no una columna nueva | Ningún cambio de esquema para un caso límite | Un rescate ocasionalmente prematuro para una fila que estuvo mucho tiempo `PENDIENTE`; se cubre con la garantía de "al menos una vez" |
| Marca de idempotencia en tabla propia (`EventosWebhookRecibidos`) | Chequeo atómico con la llave primaria, sin ventana entre comprobar y marcar | Una tabla más, exclusiva para este propósito |
| La marca se libera si `crear()` falla | Un reintento legítimo tras un fallo real puede progresar | Dos entregas verdaderamente simultáneas del mismo evento válido podrían, en el peor caso, ejecutar `crear()` dos veces; lo detiene el índice único de créditos duplicados, no la marca |
| Usuario técnico fijo para el webhook | `CreditosService.crear()` no cambia; una sola ruta de alta | Existe un usuario en `Usuarios` que no representa una persona real, y hay que saber leerlo así en la bitácora |
| Guard propio (`FirmaWebhookGuard`) en vez de lógica en el controlador | Sigue el mismo patrón que `CsrfGuard`; el controlador queda con cero lógica de seguridad | Un archivo más, específico de esta ruta |
