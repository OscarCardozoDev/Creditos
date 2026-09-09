	# Módulo de Simulación y Cálculo

Calcula cuotas, intereses y planes de amortización. Es código puro: no consulta la base de
datos, no hace red y no depende del framework. Esa propiedad lo hace el módulo más fácil de
probar del sistema y el primero que conviene construir.

---

## 1. Qué expone

| Función | Entrada | Salida |
|---|---|---|
| `eaAMensualVencida(ea)` | Tasa efectiva anual | Tasa mensual vencida |
| `cuotaFrancesa(P, i, n)` | Principal, tasa mensual, número de cuotas | Cuota fija |
| `tablaFrancesa(P, i, n)` | Ídem | Plan de amortización completo |
| `tablaAlemana(P, i, n)` | Ídem | Plan con abono a capital constante |

Y un endpoint que no escribe nada:

```json
POST /api/simulacion
{ "tipoCredito": "LIBRE_INVERSION", "valorSolicitado": 15000000,
  "numeroCuotas": 36, "sistema": "FRANCES" }
```

Devuelve cuota, total a pagar, total de intereses y la tabla periodo a periodo. Permite que el
solicitante vea las condiciones antes de comprometerse, que es el paso previo a confirmar la
solicitud.

---

## 2. La tasa la fija la entidad, no el solicitante

La tasa de interés es una **política de la entidad**, derivada del producto y del riesgo del
perfil. No es un dato que aporte quien pide el crédito.

El sistema mantiene la tabla de tasas por tipo de crédito en configuración, y la aplica así:

| Origen de la petición | Tratamiento del campo `tasaInteres` |
|---|---|
| `ASOCIADO` | Se ignora. Se impone la tasa de política |
| `ANALISTA` o `ADMIN` | Se acepta, siempre que caiga dentro de la banda del producto |

Un analista puede negociar dentro de un margen; nadie puede inventar una tasa fuera de él. Si el
campo llegara sin control, una solicitud con `tasaInteres: 0.1` sería un crédito al 0,1 % mensual
aprobado por el propio solicitante.

---

## 3. Fórmulas

### 3.1 De efectiva anual a mensual vencida

Las tasas se publican en **efectiva anual** y se cobran **mes vencido**. La equivalencia es:

$$ i_{mv} = (1 + i_{ea})^{1/12} - 1 $$

Con 18 % EA el resultado es **1,3888430 % mensual**.

El error frecuente es dividir entre 12: `18 / 12 = 1,5 %`, que no es lo mismo. Dividir entre 12
solo es correcto para una tasa **nominal**; aplicado a una efectiva, cobra de más. Sobre 15
millones a 36 meses la diferencia son cientos de miles de pesos, y significa cobrar por encima
de la tasa publicada.

### 3.2 Sistema francés — cuota fija

$$ A = P \cdot \frac{i(1+i)^n}{(1+i)^n - 1} $$

Cada periodo:

```
interes_k  = saldo_(k-1) × i
capital_k  = A - interes_k
saldo_k    = saldo_(k-1) - capital_k
```

Al principio la cuota se va casi toda en intereses y al final casi toda en capital, porque el
interés se calcula sobre un saldo que decrece.

Caso borde: con `i = 0` la fórmula se indefine por división entre cero. El sistema devuelve
`A = P / n`. Hay que contemplarlo porque el modelo admite tasa cero.

### 3.3 Sistema alemán — capital constante

```
C   = P / n              abono a capital, igual en todos los periodos
I_k = saldo_(k-1) × i    interés del periodo
A_k = C + I_k            cuota, decreciente
```

La primera cuota es la más alta y la última la más baja. El deudor amortiza capital más rápido y
paga menos intereses en total, a cambio de un mayor esfuerzo inicial.

### 3.4 Comparación de los dos sistemas

Con P = 15.000.000, n = 36 e i = 1,5 % mensual:

| Periodo | Cuota — francés | Cuota — alemán |
|---|---|---|
| 1 | 542.285,93 | 641.666,67 |
| 6 | 542.285,93 | 610.416,67 |
| 12 | 542.285,93 | 572.916,67 |
| 18 | 542.285,93 | 535.416,67 |
| 24 | 542.285,93 | 497.916,67 |
| 30 | 542.285,93 | 460.416,67 |
| 36 | 542.285,93 | 422.916,55 |
| **Total intereses** | **4.522.293,61** | **4.162.500,00** |

El alemán cuesta menos en intereses porque amortiza capital más rápido; el francés es predecible
y más liviano al comienzo.

---

## 4. Precisión y redondeo

Dos problemas distintos con una misma raíz.

**El punto flotante no representa dinero.** `0.1 + 0.2` no da `0.3` en IEEE 754. Los montos se
almacenan en `DECIMAL(18,2)` justamente para evitarlo, así que calcular con `number` y guardar
en decimal traslada el error en vez de eliminarlo. El motor usa `decimal.js` de extremo a extremo
y convierte a texto al persistir.

**La suma de cuotas redondeadas no cuadra con el capital.** Ejemplo real, sistema alemán con
P = 15.000.000 y n = 36:

```
C = 15.000.000 / 36 = 416.666,666...  →  redondeado: 416.666,67
416.666,67 × 36     = 15.000.000,12   →  sobran 0,12
```

El sistema asigna el valor redondeado a todos los periodos salvo el último, que **absorbe el
residuo**: la cuota final se calcula como el saldo pendiente más su interés. Es lo que hacen las
entidades reales, y deja dos invariantes que se verifican sin tolerancia:

```
suma(capital_k) === P        exacto
saldo_n === 0                exacto
```

Ese par de igualdades es la mejor prueba unitaria del módulo: falla ante cualquier error de
redondeo y se escribe en dos líneas.

---

## 5. Parámetros por producto

Alimentan tanto la simulación como la validación de las solicitudes.

| Tipo | Sistema | Tasa EA | Banda | Cuotas máx. | Perfil |
|---|---|---|---|---|---|
| `LIBRE_INVERSION` | Francés | 18,0 % | 14–24 % | 72 | Natural |
| `LIBRANZA` | Francés | 12,0 % | 10–16 % | 84 | Natural, pago por nómina |
| `HIPOTECARIO` | Francés | 11,0 % | 9–15 % | 240 | Natural |
| `VEHICULO` | Francés | 14,0 % | 12–20 % | 84 | Natural |
| `MICROCREDITO` | Francés | 28,0 % | 22–36 % | 36 | Natural o jurídica |
| `COMERCIAL` | **Alemán** | 16,0 % | 12–22 % | 120 | Jurídica |

Son parámetros de configuración del sistema, no tasas tomadas de una fuente oficial vigente.

La escala refleja el riesgo: la libranza es la más barata porque la cuota se descuenta
directamente de la nómina y la probabilidad de impago cae; el microcrédito es el más caro porque
atiende perfiles sin historial crediticio.

`COMERCIAL` usa amortización alemana porque una empresa con flujo de caja prefiere amortizar
capital rápido y pagar menos intereses totales, aunque las primeras cuotas sean altas. Una
persona asalariada rara vez puede sostener ese perfil de pago, y por eso los productos de banca
personal usan cuota fija.

---

## 6. Valores de referencia

Verificados con aritmética decimal. Sirven como casos de prueba del módulo.

**Francés — P = 15.000.000, i = 1,5 % mensual, n = 36:**

| Dato | Valor |
|---|---|
| `(1+i)^n` | 1,709139538 |
| Cuota | 542.285,93 |
| Total pagado | 19.522.293,61 |
| Total intereses | 4.522.293,61 |

**Alemán — mismos parámetros:**

| Dato | Valor |
|---|---|
| Abono a capital | 416.666,67 |
| Cuota 1 | 641.666,67 |
| Cuota 36 | 422.916,55 |
| Residuo absorbido en la última cuota | −0,12 |

> La cuota 36 del alemán y los totales del francés incorporan el residuo que la §4 manda
> absorber en la última cuota. Por eso 422.916,55 y no 422.916,67: tras 35 abonos de
> 416.666,67 el saldo pendiente es 416.666,55. Son los valores que cumplen
> `suma(capital) === P` y `saldo_n === 0` exactos, y los que verifica
> `api/src/simulacion/amortizacion.spec.ts`.

**Conversión de tasa:** 18 % EA equivale a 1,3888430 % mensual vencido.

**Bordes:**

| Caso | Resultado esperado |
|---|---|
| `i = 0` | Cuota = P / n, sin división entre cero |
| `n = 1` | Cuota = P × (1 + i) |
| Cualquier combinación | `suma(capital) === P` y `saldo_final === 0` |

---

## 7. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| La tasa la impone la política | El solicitante no fija el precio del dinero | El campo del contrato existe pero se sobrescribe según el rol |
| `decimal.js` en vez de `number` | Coherencia con `DECIMAL(18,2)`; sin error acumulado | Una dependencia y aritmética más verbosa |
| Residuo en la última cuota | Los invariantes se cumplen exactos | La cuota final difiere unos centavos de las demás |
| Módulo puro, sin base de datos | Se prueba entero sin infraestructura | La tasa de política debe inyectarse desde afuera |
| Cuota final = saldo pendiente + su interés | Los dos invariantes se cumplen exactos y la tabla publicada queda coherente con el residuo | La cuota 36 del alemán baja de 422.916,67 a 422.916,55 respecto de la tabla original |
