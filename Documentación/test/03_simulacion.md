# 03 · Simulación

Endpoint único, sin escritura en base:
`POST /api/simulacion`. Motor y valores de referencia en
[`modulos/03_simulacion.md`](../modulos/03_simulacion.md) — estos casos verifican por HTTP los
mismos números que ya cubren las pruebas unitarias de `operacion/02_pruebas.md §3`; aquí importa
que la ruta lo exponga igual, con la tasa que trae la petición y no la de política, porque quien
pide es `ANALISTA` o `ADMIN`.

**Preparación:** sesión activa (cualquier rol autenticado puede simular; no crea nada, así que no
exige `X-CSRF-Token`, que solo se pide en `POST`, `PATCH` y `DELETE` de escritura real — pero
`SimulacionController.simular` sí es un `POST`, y el `CsrfGuard` no distingue por controlador, solo
por método HTTP: **incluir `X-CSRF-Token` en las cuatro peticiones**).

## Casos

| # | Petición | Cuerpo o parámetros | Esperado | Qué demuestra |
|---|---|---|---|---|
| 1 | `POST /api/simulacion` | Francés: 15.000.000 / 36 cuotas / `tasaInteres: 1.5` | 200, `cuotaMensual: "542285.93"` | La tasa que trae la petición manda cuando la envía un rol que puede negociarla |
| 2 | `POST /api/simulacion` | Mismos datos, `sistema: "ALEMAN"` | 200, `tabla[0].abonoCapital: "416666.67"`, `tabla[0].valorCuota: "641666.67"`, `tabla[35].valorCuota: "422916.55"` | El alemán amortiza capital constante y la última cuota absorbe el residuo de redondeo |
| 3 | `POST /api/simulacion` | `tipoCredito: "LIBRE_INVERSION"`, `numeroCuotas: 300` | 422 `REGLA_NEGOCIO` | `LIBRE_INVERSION` admite hasta 72 cuotas; 300 es un número válido en abstracto pero el producto no lo admite |
| **4** | Sobre la tabla del caso 1 (o del 2) | Sumar la columna `abonoCapital` de las 36 filas | Exactamente `15000000.00` | **El invariante de redondeo (`modulos/03_simulacion.md §4`) se cumple exacto, no aproximado** |

---

## Detalle

### 1 · Francés con tasa explícita

```json
POST /api/simulacion
X-CSRF-Token: {{csrfToken}}

{
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 15000000,
  "numeroCuotas": 36,
  "tasaInteres": 1.5
}
```

Sin `sistema`, se usa el del producto (`LIBRE_INVERSION` → `FRANCES`,
`modulos/03_simulacion.md §5`). Respuesta esperada (recortada):

```json
{
  "sistema": "FRANCES",
  "cuotaMensual": "542285.93",
  "totalPagado": "19522293.61",
  "totalIntereses": "4522293.61"
}
```

### 2 · Mismo caso en alemán

Igual que el caso 1, agregando `"sistema": "ALEMAN"`. Comprobar en la `tabla` devuelta:

| Fila | `abonoCapital` | `valorCuota` |
|---|---|---|
| 1 | `416666.67` | `641666.67` |
| 36 | `416666.55`* | `422916.55` |

\* La última fila absorbe el residuo de redondeo: 35 abonos de `416666.67` dejan un saldo de
`416666.55`, no de `416666.67` — es la corrección que documenta
`modulos/03_simulacion.md §6`.

### 3 · Plazo fuera del producto

```json
POST /api/simulacion
{
  "tipoCredito": "LIBRE_INVERSION",
  "valorSolicitado": 15000000,
  "numeroCuotas": 300
}
```

`SimulacionService.exigirPlazoDentroDelProducto` compara contra `cuotasMaximas` de
`LIBRE_INVERSION` (72) antes de calcular nada. Responde
`422 REGLA_NEGOCIO`, no `400`: 300 es un entero positivo válido en cualquier otro contexto, lo que
falla es la regla del producto, y esa distinción es la que fija
`arquitectura/04_manejo_de_errores.md §4`.

### 4 · Invariante de redondeo

Sobre la `tabla` de cualquiera de los dos casos anteriores, sumar la columna `abonoCapital` de las
36 filas. El resultado debe ser exactamente `15000000.00`, sin importar el sistema de
amortización. En Postman, un script de *Tests* lo automatiza:

```javascript
const tabla = pm.response.json().data.tabla;
const suma = tabla.reduce((acc, fila) => acc + Number(fila.abonoCapital), 0);
pm.test('suma de capital == valor solicitado', () => {
  pm.expect(suma.toFixed(2)).to.eql('15000000.00');
});
```

Es la misma comprobación que hace la prueba unitaria más barata del módulo
(`operacion/02_pruebas.md §3`): "falla ante cualquier error de redondeo en cualquiera de los dos
sistemas".
