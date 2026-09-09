import Decimal from 'decimal.js';

/**
 * En el contrato y en la base la tasa viaja como porcentaje mensual con seis decimales
 * (1.388843 = 1,388843 %). Las formulas trabajan en tanto por uno, asi que se convierte aqui
 * y en un solo sitio, que es donde se puede equivocar uno una vez y no diez.
 */
const DECIMALES_DE_TASA = 6;

/** Pasa un porcentaje mensual (1.5) al tanto por uno que usan las formulas (0.015). */
export function porcentajeATantoPorUno(porcentaje: Decimal.Value): Decimal {
  return new Decimal(porcentaje).div(100);
}

/** Pasa un tanto por uno (0.015) al porcentaje con el que se guarda y se publica (1.500000). */
export function tantoPorUnoAPorcentaje(tanto: Decimal.Value): Decimal {
  return new Decimal(tanto).times(100).toDecimalPlaces(DECIMALES_DE_TASA, Decimal.ROUND_HALF_UP);
}

/** Convierte una tasa mensual en tanto por uno a su equivalente efectiva anual. */
export function mensualAEfectivaAnual(mensual: Decimal.Value): Decimal {
  return new Decimal(mensual).plus(1).pow(12).minus(1);
}
