# Conceptos de Crédito

Base conceptual del dominio: qué es un crédito, quiénes intervienen, qué productos existen y
con qué fórmulas se calculan. El resto de la documentación da estos términos por conocidos.

**Un crédito** es una operación financiera donde una entidad o persona presta una cantidad de dinero a otra, con el compromiso de devolverlo en un plazo definido junto con intereses y costos adicionales. Para entender como funciona un crédito es necesario conocer estos 4 conceptos claves:

- **Acreedor:** Quien presta el dinero (por ejemplo, un banco).
- **Deudor:** Quien recibe el dinero y debe pagar.
- **Plazo:** El tiempo acordado para terminar de pagar la deuda.
- **Interés:** El costo extra que se cobra por usar ese dinero prestado.

---

## Tipos de Créditos

Existen diferentes tipos de créditos:

### Créditos según su finalidad

- **Crédito de Consumo:** Dinero destinado a la compra de bienes o servicios de uso personal, como viajes, electrodomésticos o tecnología. Suelen ser de corto a mediano plazo.
- **Crédito Hipotecario:** Préstamo a largo plazo diseñado exclusivamente para la compra, construcción o remodelación de una vivienda. La propiedad adquirida queda como garantía del pago.
- **Crédito Comercial o Empresarial:** Financiamiento dirigido a empresas para cubrir gastos operativos, comprar maquinaria, expandir el negocio o pagar a proveedores.
- **Crédito Automotriz:** Un tipo de crédito específico para la adquisición de vehículos nuevos o usados, donde el propio automóvil suele funcionar como prenda de garantía.
- **Crédito Educativo:** Préstamos con condiciones flexibles destinados a financiar estudios universitarios, posgrados o especializaciones.

### **Créditos Según su Estructura y Garantía**

- **Tarjeta de Crédito:** Un cupo de dinero rotativo que el banco te otorga para usar en cualquier momento. A medida que pagas lo que debes, el cupo vuelve a estar disponible.
- **Línea de Crédito:** Dinero asignado a una cuenta bancaria del cual puedes disponer en emergencias. Solo pagas intereses por el monto exacto que utilices.
- **Crédito de Libranza:** Préstamo donde las cuotas mensuales se descuentan directamente de tu nómina de sueldo o pensión, lo que reduce el riesgo de impago y suele ofrecer menores tasas de interés.
- **Crédito Microempresarial (Microcrédito):** Financiamiento de montos menores destinado a micronegocios o trabajadores independientes que no acceden fácilmente a la banca tradicional.

---

## Actores en un Crédito

Dependiendo el tipo de crédito se le puede prestar a diferentes tipo de personas o empresas:

### **Personas Naturales**

Son ciudadanos particulares que solicitan un crédito a título personal. El perfil se segmenta por tipo de ingreso, porque de ahí sale la evaluación de riesgo:

- **Empleados dependientes:** Tienen un contrato laboral fijo. Son los de menor riesgo porque cuentan con un sueldo mensual estable. Es el perfil natural de la **libranza**, donde la cuota se descuenta directamente de la nómina.
- **Trabajadores independientes / Freelancers:** Sus ingresos varían mes a mes. Validar su capacidad de pago exige extractos bancarios o declaraciones de impuestos.
- **Pensionados:** Personas retiradas con un ingreso fijo garantizado por el gobierno o fondos privados. Tienen un riesgo muy bajo, pero se les limita el plazo del crédito según su edad.

### **Personas Jurídicas (Empresas y Negocios)**

Son organizaciones o empresas legalmente constituidas. Los montos de préstamo son más altos y la evaluación no depende de una persona, sino de la salud financiera del negocio:

- **Microempresas / Emprendedores:** Pequeños negocios que buscan capital de trabajo. Su evaluación se apoya en las ventas diarias, disponibles a través de la facturación electrónica.
- **Pymes y Grandes Empresas:** Compañías consolidadas que buscan financiamiento para expansión, maquinaria o nómina. Requieren un módulo de aprobación más robusto y manual (comité de crédito).

---

## Formulas Para Calcular un Crédito

### 1. Sistema de Amortización Francés

Es el más utilizado en el mundo para **Créditos de Consumo, Vivienda (Hipotecarios), Vehículos y Libranzas**. El usuario paga exactamente la misma cantidad de dinero todos los meses. Al principio de la vida del crédito se pagan más intereses que capital, y al final se paga más capital que intereses.

 **Fórmula de la Cuota Mensual (A):**

- **P** = Principal (Monto total prestado).
- **i** = Tasa de interés periódica (mensual, expresada en decimales. Ej: 1.5% = 0.015.
- **n** = Número total de periodos (meses)

$$
A = P \cdot \frac{i \cdot (1 + i)^n}{(1 + i)^n - 1}

$$

### 2.  Sistema de Amortización Alemán (Cuota Variable / Capital Fijo)

Muy utilizado en algunos **Créditos Comerciales/Empresariales o Hipotecarios** de largo plazo. Aquí lo que se mantiene fijo es el abono al capital, por lo tanto, las cuotas mensuales van disminuyendo mes a mes (la primera cuota es la más alta y la última es la más baja).

- Abono a Capital Fijo (C)

$$
C = \frac{P}{n}

$$

- Interés del periodo k

$$
I_k = S_{k-1} \cdot i
$$

- Valor de la Cuota del periodo

$$
A_k = C + I_k
$$

### 3. Fórmulas de Transición de Tasas (Efectiva a Nominal)

Los bancos suelen publicar sus tasas en **Efectiva Anual (EA)** por ley, pero se necesita cobrar los intereses de forma **Mes Vencido (MV)**. Para esto se debe aplicar la fórmula de equivalencia de tasas.

**Fórmula de Tasa Mensual Vencida a partir de Efectiva Anual**

$$
i_{mv} = (1 + i_{ea})^{\frac{1}{12}} - 1

$$

---

## Matriz de Comparación

Cruzando lo anterior: a qué producto accede cada perfil, con qué sistema se amortiza y bajo qué
condiciones. Es la tabla que el módulo de créditos hace cumplir como regla de negocio
(`modulos/02_creditos.md §7`) y el módulo de simulación como parámetro de cálculo
(`modulos/03_simulacion.md §5`).

| Producto | Perfil que accede | Sistema | Tasa EA | Banda negociable | Cuotas máx. |
|---|---|---|---|---|---|
| `LIBRE_INVERSION` | Persona natural | Francés | 18,0 % | 14–24 % | 72 |
| `LIBRANZA` | Persona natural, con pago por nómina | Francés | 12,0 % | 10–16 % | 84 |
| `HIPOTECARIO` | Persona natural | Francés | 11,0 % | 9–15 % | 240 |
| `VEHICULO` | Persona natural | Francés | 14,0 % | 12–20 % | 84 |
| `MICROCREDITO` | Natural o jurídica | Francés | 28,0 % | 22–36 % | 36 |
| `COMERCIAL` | Persona jurídica | Alemán | 16,0 % | 12–22 % | 120 |

- **La escala de tasas es la escala de riesgo.** La libranza es la más barata porque la cuota sale
  de la nómina antes de llegar al deudor; el microcrédito es el más caro porque atiende perfiles
  sin historial crediticio.
- **El sistema de amortización sigue al perfil de flujo de caja, no al monto.** Una empresa con
  caja prefiere el alemán: amortiza capital rápido y paga menos intereses en total, a cambio de
  cuotas iniciales altas. Un asalariado rara vez sostiene ese perfil, y por eso toda la banca
  personal usa cuota fija.
- **La banda existe porque la tasa la fija la entidad, no el solicitante.** Un analista negocia
  dentro del margen; nadie inventa una tasa fuera de él.

Las tasas son parámetros de configuración del sistema, no valores tomados de una fuente oficial
vigente.



