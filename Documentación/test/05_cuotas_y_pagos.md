# 05 · Cuotas y comportamiento de pago

Extiende el módulo de créditos — no hay controlador propio, los
endpoints viven en `CreditosController` (`modulos/02_creditos.md §5.1`). Contrato completo ahí
mismo.

**Preparación:** esta carpeta reutiliza `{{creditoId}}`, el crédito de `04_creditos.md`, que su
caso 15 ya dejó `APROBADO` con 36 cuotas generadas (LIBRE_INVERSION, 15.000.000, 1,5 % mensual, 36
cuotas — los valores de referencia de `modulos/03_simulacion.md §6`). Ejecutar esta carpeta
**antes** de borrar ese crédito o de avanzarlo a otro estado terminal fuera de esta secuencia.

Los casos 6 y 8 necesitan pagar una cuota antes o después de su vencimiento **real**, y el primer
vencimiento del plan cae un mes después de la aprobación (`modulos/02_creditos.md §5`). Como
`RegistrarPagoDto` rechaza cualquier `fechaPago` futura, no se puede probar "pagó tres días tarde"
sobre un crédito recién aprobado sin esperar un mes de calendario. La preparación de los casos 6 y
8 (nota antes de esa tabla) adelanta a mano, con SQL directo, la `fecha_vencimiento` de las cuotas
1 y 2 a un par de semanas atrás — no es un `UPDATE` que la API haría nunca, es la forma de darle a
la prueba manual un escenario que en producción tardaría semanas en aparecer solo.

## Casos

| # | Petición | Cuerpo o parámetros | Esperado | Qué demuestra |
|---|---|---|---|---|
| 1 | `GET /api/creditos/{{creditoId}}/cuotas` | — | 200, 36 filas, todas `estado: "PENDIENTE"` | La aprobación (`04_creditos.md` caso 15) generó el plan completo en la misma transacción |
| **2** | Sobre la respuesta anterior | Sumar `abonoCapital` de las 36 filas | Exactamente `15000000.00` | **El redondeo se verifica contra datos persistidos, no solo contra el cálculo en memoria** |
| **3** | Sobre la misma respuesta | `saldoPosterior` de la fila 36 | Exactamente `0.00` | **El plan persistido cierra en cero; ningún error de redondeo se acumula hasta el final** |
| 4 | `GET /api/creditos/{{creditoId}}/cuotas` | — | 36 filas ordenadas por `numeroCuota`, vencimientos consecutivos mes a mes | El plan es predecible y reconstruible, no solo internamente consistente |
| 5 | `GET /api/creditos/{{creditoId}}` | Antes de cualquier pago | `diasPromedioPago: null` | `null` significa "todavía no pagó nada"; `0` significaría "pagó siempre puntual", y son hechos distintos |
| 6 | `POST /api/creditos/{{creditoId}}/cuotas/1/pago` | `fechaPago` 3 días después del vencimiento (ya adelantado, ver preparación) | 200, la cuota 1 queda `PAGADA` | El pago tardío se registra igual; la mora no bloquea el pago |
| 7 | `GET /api/creditos/{{creditoId}}` | Tras el caso 6 | `diasPromedioPago: 3` | El promedio se recalcula al vuelo desde las cuotas persistidas |
| 8 | `POST /api/creditos/{{creditoId}}/cuotas/2/pago` | `fechaPago` 1 día antes del vencimiento | 200; luego `GET /api/creditos/{{creditoId}}` → `diasPromedioPago: 1` | Promedio de `+3` y `−1`: un pago anticipado resta, no se trunca a cero |
| 9 | `POST /api/creditos/{{creditoId}}/cuotas/1/pago` | Repetir el cuerpo del caso 6 | 422 `REGLA_NEGOCIO` | Una cuota ya `PAGADA` no admite un segundo pago |
| 10 | `POST /api/creditos/{{creditoId}}/cuotas/3/pago` | `fechaPago` en el futuro | 400 `VALIDATION_ERROR` | Un pago no puede quedar registrado antes de haber ocurrido |
| 11 | `POST /api/creditos/{{creditoId}}/cuotas/99/pago` | Cuerpo válido, número de cuota inexistente | 404 `CUOTA_NOT_FOUND` | Un crédito de 36 cuotas no tiene una cuota 99: el recurso no existe |
| 12 | `PATCH /api/creditos/{{creditoId}}/estado` | `{ "estado": "CANCELADO", "observacion": "..." }` | 200; cuotas 3–36 quedan `ANULADA`, cuotas 1 y 2 siguen `PAGADA` | Cancelar no deshace lo ya pagado; solo retira lo que faltaba por cobrar |
| **13** | `INSERT` manual (SQL directo, no HTTP) de una cuota `PENDIENTE` con `fecha_pago` no nula | — | El motor rechaza el `INSERT` por `CK_Cuotas_Pago` | **El estado incoherente es imposible a nivel de motor, no solo de servicio** |
| 14 | `GET /api/creditos/{{creditoSolicitadoId}}/cuotas` | Crédito recién creado, aún `SOLICITADO` | 200, `[]` | El plan solo existe desde la aprobación; antes, cero filas |

---

## Detalle

### 1 a 4 · El plan recién generado

```
GET /api/creditos/{{creditoId}}/cuotas
```

Cada fila trae `numeroCuota`, `fechaVencimiento`, `valorCuota`, `abonoCapital`, `abonoInteres`,
`saldoPosterior`, `estado` y (nulos por ahora) `fechaPago`/`valorPagado`. Tres verificaciones sobre
la misma respuesta, con un script de *Tests*:

```javascript
const plan = pm.response.json().data;

pm.test('36 cuotas, todas PENDIENTE', () => {
  pm.expect(plan).to.have.lengthOf(36);
  plan.forEach((c) => pm.expect(c.estado).to.eql('PENDIENTE'));
});

pm.test('suma de capital == valor solicitado', () => {
  const suma = plan.reduce((acc, c) => acc + Number(c.abonoCapital), 0);
  pm.expect(suma.toFixed(2)).to.eql('15000000.00');
});

pm.test('saldo final en cero', () => {
  pm.expect(plan[plan.length - 1].saldoPosterior).to.eql('0.00');
});

pm.test('vencimientos consecutivos mes a mes', () => {
  for (let i = 1; i < plan.length; i++) {
    const anterior = new Date(plan[i - 1].fechaVencimiento);
    const actual = new Date(plan[i].fechaVencimiento);
    const meses = (actual.getUTCFullYear() - anterior.getUTCFullYear()) * 12
      + (actual.getUTCMonth() - anterior.getUTCMonth());
    pm.expect(meses).to.eql(1);
  }
});
```

Guardar `plan[0].fechaVencimiento` y `plan[1].fechaVencimiento` — se necesitan para la preparación
de los casos 6 y 8:

```javascript
pm.collectionVariables.set('vencimientoCuota1', plan[0].fechaVencimiento);
pm.collectionVariables.set('vencimientoCuota2', plan[1].fechaVencimiento);
```

### 5 · Antes de pagar

```
GET /api/creditos/{{creditoId}}
```

`diasPromedioPago` debe ser `null` en el JSON de la respuesta — no `0` ni el campo ausente.

### Preparación de los casos 6 y 8 — adelantar el vencimiento

Con un cliente SQL contra la misma base (`sqlcmd`, Azure Data Studio, lo que haya a mano),
adelantar dos semanas la `fecha_vencimiento` de las cuotas 1 y 2 del crédito:

```sql
UPDATE dbo.Cuotas
SET fecha_vencimiento = DATEADD(day, -14, fecha_vencimiento)
WHERE credito_id = '{{creditoId}}' AND numero_cuota IN (1, 2);
```

Esto no toca `estado`, `valor_cuota` ni ninguna otra columna: solo mueve el vencimiento al pasado
para que exista una fecha de pago "tres días después" y otra "un día antes" que sigan sin ser
fechas futuras. Sirve exclusivamente para esta prueba manual; nunca se ejecuta en la aplicación.

### 6 y 7 · Pago tardío

```json
POST /api/creditos/{{creditoId}}/cuotas/1/pago
X-CSRF-Token: {{csrfToken}}

{ "fechaPago": "<vencimientoCuota1 + 3 días>", "valorPagado": 542285.93 }
```

Calcular la fecha con un *pre-request script* o a mano a partir de `vencimientoCuota1`. `200`, la
cuota 1 queda `PAGADA`. El `GET /api/creditos/{{creditoId}}` que sigue debe traer
`diasPromedioPago: 3`.

### 8 · Pago anticipado

```json
POST /api/creditos/{{creditoId}}/cuotas/2/pago
{ "fechaPago": "<vencimientoCuota2 - 1 día>", "valorPagado": 542285.93 }
```

`200`. `GET /api/creditos/{{creditoId}}` debe traer `diasPromedioPago: 1`: el promedio de `+3`
(cuota 1) y `−1` (cuota 2) es `1`, no `2` ni `0` — confirma que un pago adelantado resta días en
vez de contarse como cero.

### 9 · Pago duplicado

Repetir exactamente el caso 6. La cuota 1 ya no está `PENDIENTE`:
`exigirCuotaPendiente` responde `422 REGLA_NEGOCIO` con un mensaje que nombra el número de cuota.

### 10 · Fecha futura

```json
POST /api/creditos/{{creditoId}}/cuotas/3/pago
{ "fechaPago": "2099-01-01", "valorPagado": 542285.93 }
```

El decorador `NoFechaFutura` de `RegistrarPagoDto` lo corta en el DTO: `400`, sin llegar al
servicio.

### 11 · Cuota inexistente

```
POST /api/creditos/{{creditoId}}/cuotas/99/pago
{ "fechaPago": "2026-10-08", "valorPagado": 542285.93 }
```

El crédito tiene 36 cuotas; la 99 no existe. `404 CUOTA_NOT_FOUND` — distinto del `422` del caso 9,
que sí encuentra la cuota y falla por su estado.

### 12 · Cancelación tras aprobar

```json
PATCH /api/creditos/{{creditoId}}/estado
{ "estado": "CANCELADO", "observacion": "Desistimiento del asociado" }
```

`200`. Verificar con `GET /api/creditos/{{creditoId}}/cuotas`: las cuotas 3 a 36 (las que seguían
`PENDIENTE`) ahora están `ANULADA`; las cuotas 1 y 2, ya `PAGADA`, no cambiaron. Nada se borra: el
historial de lo cobrado queda intacto.

### 13 · El motor, no solo el servicio

No es una petición HTTP. Contra la misma base de datos, con cualquier cliente SQL:

```sql
INSERT INTO dbo.Cuotas (credito_id, numero_cuota, fecha_vencimiento, valor_cuota,
                        abono_capital, abono_interes, saldo_posterior, estado, fecha_pago)
VALUES ('{{creditoId}}', 999, '2026-01-01', 100000, 90000, 10000, 0, 'PENDIENTE', '2026-01-05');
```

Debe fallar por la restricción `CK_Cuotas_Pago`: una cuota `PENDIENTE` no puede traer
`fecha_pago` no nula. Es la comprobación de que la coherencia entre `estado` y las columnas de
pago no depende de que el servicio la respete — el motor la exige aunque el `INSERT` venga de
cualquier otro lado (una carga masiva, un script de corrección).

### 14 · Crédito sin aprobar

Crear un crédito nuevo y dejarlo en `SOLICITADO`, sin avanzarlo:

```json
POST /api/creditos
{
  "identificacionAsociado": "1005556681",
  "nombreAsociado": "Quinta Persona",
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 5000000,
  "numeroCuotas": 12,
  "formaPago": "CAJA"
}
```

Guardar el `id` en `creditoSolicitadoId`. `GET /api/creditos/{{creditoSolicitadoId}}/cuotas` debe
devolver `[]`: el plan de amortización solo existe desde la aprobación
(`modulos/02_creditos.md §5`), nunca antes.
