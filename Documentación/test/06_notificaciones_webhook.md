# 06 · Notificaciones y webhook

Mecanismo completo en
[`modulos/05_notificaciones.md`](../modulos/05_notificaciones.md) y
[`arquitectura/07_webhook.md`](../arquitectura/07_webhook.md).

Dos direcciones distintas, con preparación distinta:

- **Casos 1 a 7 (salida):** lo que la API envía a un sistema externo. El evento se escribe en
  `Notificaciones` desde `CreditosService.crear()` y `cambiarEstado()` (ya ejercitados en
  `04_creditos.md`); un intervalo programado (`EntregaTarea`) lo entrega. No hay
  `GET /api/notificaciones` en el contrato — es una tabla interna — así que la verificación de
  estos casos es **SQL directo** sobre `Notificaciones`, no una petición HTTP adicional.
- **Casos 8 a 11 (entrada):** el receptor `POST /api/webhooks/creditos`, donde Postman actúa como
  si fuera el sistema externo, firmando el cuerpo a mano.

## Preparación

**Para los casos 1 a 7**, un receptor de prueba. El repositorio trae uno sin dependencias, que
además verifica la firma por su cuenta:

```bash
node api/pruebas-manuales/receptor-webhook.mjs            # responde 200 (casos 1, 2, 6, 7)
node api/pruebas-manuales/receptor-webhook.mjs --estado=500  # caso 3
node api/pruebas-manuales/receptor-webhook.mjs --estado=400  # caso 4
```

Toma el puerto de `WEBHOOK_URL` y el secreto de `WEBHOOK_SECRET`, ambos del `.env` de la raíz;
con el valor de referencia (`http://host.docker.internal:4000/receptor`) no hay nada que
configurar. Para el caso 5 basta con no arrancarlo. Sirve igual un Mock Server de Postman o un
servicio de captura de peticiones, apuntando `WEBHOOK_URL` a esa URL y reiniciando el contenedor
`api` (`docker compose up -d --build api`) para que tome el valor nuevo. `WORKER_INTERVALO_MS`
(10 segundos en el `.env` de referencia) es cuánto hay que esperar entre disparar la acción y
comprobar el resultado en la tabla.

**Para los casos 8 a 11**, la variable de colección `webhookSecret`, copiada a mano del
`WEBHOOK_SECRET` del `.env` de la API — nunca se guarda en el archivo de la colección compartida,
solo en el entorno local de quien la ejecuta.

## Casos

| # | Situación / petición | Verificación | Esperado | Qué demuestra |
|---|---|---|---|---|
| 1 | Crear un crédito (`POST /api/creditos`) | `SELECT` sobre `Notificaciones WHERE credito_id = '<id>'` | Una fila `PENDIENTE`, con el `credito_id` correcto y `evento = 'credito.creado'` | La bandeja de salida se escribe en la misma transacción que el crédito |
| 2 | Esperar un ciclo del worker, con el receptor arriba y respondiendo `200` | Mismo `SELECT` | `estado = 'ENVIADO'`, `enviado_en` no nulo, `http_status = 200` | El camino completo de entrega funciona de punta a punta |
| 3 | Configurar el receptor para responder `500` y repetir el caso 1 | `SELECT` tras un ciclo del worker | `intentos` subió, `proximo_intento` en el futuro, `estado` sigue `PENDIENTE` | Un `5xx` es transitorio: se reintenta con retroceso, no se abandona |
| 4 | Configurar el receptor para responder `400` y repetir el caso 1 | `SELECT` tras un ciclo del worker | `estado = 'FALLIDO'`, `intentos` no vuelve a subir en ciclos siguientes | Un `4xx` es error propio: reintentar no lo arregla |
| **5** | **Apuntar `WEBHOOK_URL` a una dirección que no responde (o parar el receptor) y crear un crédito** | `POST /api/creditos`, revisar el código de respuesta | **201, igual que siempre** | **El desacoplamiento real: un tercero caído no impide registrar el crédito** |
| 6 | `PATCH /api/creditos/:id/estado` sobre un crédito propio | `SELECT` sobre `Notificaciones` del mismo `credito_id` | Nueva fila con `evento = 'credito.estado_cambiado'` | Cada cambio de estado deja su propio evento, no solo el alta |
| 7 | Con el receptor capturando la petición (caso 2) | Recalcular `HMAC-SHA256(payload, WEBHOOK_SECRET)` a mano y comparar contra el `X-Signature` capturado | Coinciden byte a byte | La integridad del evento se puede verificar de forma independiente, sin confiar en la propia API |
| 8 | `POST /api/webhooks/creditos` con firma válida | — | 200, `{ "procesado": true }`; el crédito aparece en `GET /api/creditos` | El receptor delega en el mismo `CreditosService.crear()` que usa la API por la vía normal |
| 9 | `POST /api/webhooks/creditos` con firma inválida | — | 401 `FIRMA_INVALIDA` | Sin sesión ni cookie, la firma es la única credencial del receptor |
| 10 | Repetir exactamente el caso 8 (mismo `eventId`, misma firma) | — | 200, `{ "procesado": false }`; **no** aparece un segundo crédito | `EventosWebhookRecibidos` descarta el duplicado antes de llamar a `crear()` |
| 11 | `POST /api/webhooks/creditos` con `timestamp` de hace más de 5 minutos (firma válida para ese cuerpo) | — | 401 `FIRMA_INVALIDA` | Una firma válida no basta contra la reproducción: el evento también tiene que ser reciente |

---

## Detalle

### 1 a 6 · Verificación por SQL

No hay petición nueva que documentar aparte de la que ya hacen `04_creditos.md` (crear, cambiar
estado). La comprobación es una consulta directa:

```sql
SELECT notificacion_id, evento, estado, intentos, http_status, proximo_intento, enviado_en, ultimo_error
FROM dbo.Notificaciones
WHERE credito_id = '<id del credito>'
ORDER BY creado_en DESC;
```

Para los casos 3 y 4, cambiar la respuesta configurada del receptor **antes** de crear el crédito
de ese caso (usar una identificación nueva cada vez, para no chocar con la regla de duplicado de
`04_creditos.md §7`), y consultar de nuevo tras esperar al menos un `WORKER_INTERVALO_MS`.

### 5 · El caso que sostiene todo el patrón

```json
POST /api/creditos
X-CSRF-Token: {{csrfToken}}

{
  "identificacionAsociado": "1005556690",
  "nombreAsociado": "Sexta Persona",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 8000000,
  "numeroCuotas": 12,
  "formaPago": "CAJA"
}
```

Con `WEBHOOK_URL` apuntando a una dirección inalcanzable (o el receptor detenido), la respuesta
sigue siendo `201` con el crédito completo. La fila en `Notificaciones` queda `PENDIENTE` y ahí se
queda hasta que el receptor vuelva — el `SELECT` del caso 1 lo confirma — pero la petición del
cliente nunca lo nota. Es la comprobación de que la disponibilidad de un tercero no decide si un
crédito se registra.

### 7 · Verificación independiente de la firma

Con el cuerpo exacto que capturó el receptor en el caso 2 (el `payload` tal cual, sin
reserializar) y el `WEBHOOK_SECRET` del `.env`:

```javascript
// En la consola de Postman, o en un script de Tests con el cuerpo capturado a mano:
const payload = '<pegar aquí el cuerpo exacto recibido por el receptor>';
const esperada = 'sha256=' + CryptoJS.HmacSHA256(payload, pm.collectionVariables.get('webhookSecret')).toString(CryptoJS.enc.Hex);
console.log(esperada); // comparar contra la cabecera X-Signature que capturó el receptor
```

Si el receptor es un Mock Server de Postman, la cabecera recibida se ve en el log de esa
petición. Si difiere aunque sea en un carácter, algo entre el `payload` guardado y el que de verdad
viajó no coincide — la comparación debe hacerse sobre la cadena cruda, no sobre un objeto vuelto a
serializar (`arquitectura/07_webhook.md §5`).

### 8 · Receptor con firma válida

Cuerpo (`WebhookCreditoDto`): un `eventId` propio y `data` con la misma forma que
`CrearCreditoDto`, no con la forma del evento de salida.

**Pre-request Script**, para firmar el cuerpo exacto que se va a enviar:

```javascript
const cuerpo = JSON.stringify({
  eventId: pm.variables.replaceIn('{{$guid}}'),
  timestamp: new Date().toISOString(),
  data: {
    identificacionAsociado: '1005556691',
    nombreAsociado: 'Sistema Externo',
    tipoCredito: 'LIBRE_INVERSION',
    valorSolicitado: 7000000,
    numeroCuotas: 24,
    formaPago: 'CAJA',
  },
});
pm.collectionVariables.set('webhookBody', cuerpo);
const firma = 'sha256=' + CryptoJS.HmacSHA256(cuerpo, pm.collectionVariables.get('webhookSecret')).toString(CryptoJS.enc.Hex);
pm.collectionVariables.set('webhookSignature', firma);
pm.collectionVariables.set('webhookEventId', JSON.parse(cuerpo).eventId); // para el caso 10
```

Cuerpo crudo de la petición (pegar la variable completa, no reconstruir el JSON en el editor de
Postman: tiene que viajar exactamente el mismo texto que se firmó):

```
{{webhookBody}}
```

Cabecera:

```
X-Signature: {{webhookSignature}}
```

No hace falta `X-CSRF-Token` ni cookie de sesión: la ruta está marcada `@Publico()` precisamente
porque la firma HMAC es su propia autenticación. `200`, `{ "procesado": true }`. Confirmar con
`GET /api/creditos?identificacion=1005556691` que el crédito quedó creado.

### 9 · Firma inválida

Repetir el caso 8 con otro `eventId` (nuevo `{{$guid}}` en el *pre-request script*) pero cambiando
la cabecera a mano a un valor que no corresponda:

```
X-Signature: sha256=0000000000000000000000000000000000000000000000000000000000000000
```

`401 FIRMA_INVALIDA`. El crédito no se crea.

### 10 · Evento repetido

Repetir **exactamente** la petición del caso 8: mismo `{{webhookBody}}`, misma `{{webhookSignature}}`
(no correr de nuevo el *pre-request script*, que generaría un `eventId` distinto). `200`, pero esta
vez `{ "procesado": false }`. `GET /api/creditos?identificacion=1005556691` debe seguir mostrando
un único crédito, no dos: `NotificacionesRepository.intentarMarcarRecibido` ya vio ese `eventId` y
no volvió a llamar a `crear()`.

### 11 · Evento caducado

Nuevo *pre-request script*, con un `timestamp` de hace más de 5 minutos **dentro del cuerpo que se
firma** (la firma tiene que ser válida para ese cuerpo; lo que falla es la vigencia, no la firma):

```javascript
const cuerpo = JSON.stringify({
  eventId: pm.variables.replaceIn('{{$guid}}'),
  timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutos atrás
  data: {
    identificacionAsociado: '1005556692',
    nombreAsociado: 'Sistema Externo Tardio',
    tipoCredito: 'LIBRE_INVERSION',
    valorSolicitado: 7000000,
    numeroCuotas: 24,
    formaPago: 'CAJA',
  },
});
pm.collectionVariables.set('webhookBody', cuerpo);
pm.collectionVariables.set('webhookSignature', 'sha256=' + CryptoJS.HmacSHA256(cuerpo, pm.collectionVariables.get('webhookSecret')).toString(CryptoJS.enc.Hex));
```

Mismo cuerpo (`{{webhookBody}}`) y cabecera (`{{webhookSignature}}`) que en el caso 8. `401
FIRMA_INVALIDA` — el mismo código que una firma que no coincide, porque para quien consume la API
"la firma no autentica esto" cubre ambos motivos (`arquitectura/04_manejo_de_errores.md §3`).
