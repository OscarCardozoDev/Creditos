import Decimal from 'decimal.js';

/** Los montos se guardan en DECIMAL(18,2): el motor redondea a dos decimales en cada cuota. */
const DECIMALES_DE_MONTO = 2;

export interface FilaAmortizacion {
  numeroCuota: number;
  valorCuota: string;
  abonoCapital: string;
  abonoInteres: string;
  saldoPosterior: string;
}

/** Convierte una tasa efectiva anual a mensual vencida: (1 + ea)^(1/12) - 1. */
export function eaAMensualVencida(efectivaAnual: Decimal.Value): Decimal {
  return new Decimal(1).plus(efectivaAnual).pow(new Decimal(1).div(12)).minus(1);
}

/** Calcula la cuota fija del sistema frances. Con tasa cero devuelve capital entre cuotas. */
export function cuotaFrancesa(capital: Decimal.Value, tasaMensual: Decimal.Value, cuotas: number): Decimal {
  const principal = new Decimal(capital);
  const tasa = new Decimal(tasaMensual);

  if (tasa.isZero()) {
    return principal.div(cuotas);
  }
  const factor = tasa.plus(1).pow(cuotas);
  return principal.times(tasa.times(factor)).div(factor.minus(1));
}

/** Arma el plan de cuota fija: el interes baja y el abono a capital sube cada periodo. */
export function tablaFrancesa(capital: Decimal.Value, tasaMensual: Decimal.Value, cuotas: number): FilaAmortizacion[] {
  const tasa = new Decimal(tasaMensual);
  const cuota = cuotaFrancesa(capital, tasa, cuotas).toDecimalPlaces(DECIMALES_DE_MONTO, Decimal.ROUND_HALF_UP);

  return construirTabla(capital, cuotas, (saldo, esLaUltima) => {
    const interes = saldo.times(tasa).toDecimalPlaces(DECIMALES_DE_MONTO, Decimal.ROUND_HALF_UP);
    const abono = esLaUltima ? saldo : cuota.minus(interes);
    return { interes, abono };
  });
}

/** Arma el plan de capital constante: la cuota arranca alta y baja periodo a periodo. */
export function tablaAlemana(capital: Decimal.Value, tasaMensual: Decimal.Value, cuotas: number): FilaAmortizacion[] {
  const tasa = new Decimal(tasaMensual);
  const abonoFijo = new Decimal(capital).div(cuotas).toDecimalPlaces(DECIMALES_DE_MONTO, Decimal.ROUND_HALF_UP);

  return construirTabla(capital, cuotas, (saldo, esLaUltima) => {
    const interes = saldo.times(tasa).toDecimalPlaces(DECIMALES_DE_MONTO, Decimal.ROUND_HALF_UP);
    const abono = esLaUltima ? saldo : abonoFijo;
    return { interes, abono };
  });
}

/**
 * Recorre los periodos con la regla de abono que le pasen y deja el saldo final exacto en cero:
 * la ultima cuota absorbe el residuo del redondeo, que es lo que hacen las entidades reales.
 */
function construirTabla(
  capital: Decimal.Value,
  cuotas: number,
  calcularPeriodo: (saldo: Decimal, esLaUltima: boolean) => { interes: Decimal; abono: Decimal },
): FilaAmortizacion[] {
  const filas: FilaAmortizacion[] = [];
  let saldo = new Decimal(capital);

  for (let numeroCuota = 1; numeroCuota <= cuotas; numeroCuota++) {
    const { interes, abono } = calcularPeriodo(saldo, numeroCuota === cuotas);
    saldo = saldo.minus(abono);

    filas.push({
      numeroCuota,
      valorCuota: aMonto(abono.plus(interes)),
      abonoCapital: aMonto(abono),
      abonoInteres: aMonto(interes),
      saldoPosterior: aMonto(saldo),
    });
  }
  return filas;
}

/** Deja un valor con los dos decimales con los que se persiste. */
function aMonto(valor: Decimal): string {
  return valor.toFixed(DECIMALES_DE_MONTO);
}
