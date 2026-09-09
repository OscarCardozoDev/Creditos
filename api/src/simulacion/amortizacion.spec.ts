import Decimal from 'decimal.js';
import { cuotaFrancesa, eaAMensualVencida, FilaAmortizacion, tablaAlemana, tablaFrancesa } from './amortizacion';

/** Caso de referencia de Documentacion/modulos/03_simulacion.md §6. */
const CAPITAL = 15_000_000;
const TASA_MENSUAL = 0.015;
const CUOTAS = 36;

/** Suma una columna de la tabla con aritmetica decimal. */
function sumar(filas: FilaAmortizacion[], columna: 'abonoCapital' | 'abonoInteres' | 'valorCuota'): string {
  return filas.reduce((total, fila) => total.plus(fila[columna]), new Decimal(0)).toFixed(2);
}

describe('conversion de tasas', () => {
  it('18 % efectiva anual equivale a 1,3888430 % mensual vencido', () => {
    const mensual = eaAMensualVencida('0.18').times(100).toDecimalPlaces(7);
    expect(mensual.toFixed(7)).toBe('1.3888430');
  });
});

describe('sistema frances', () => {
  it('produce la cuota de referencia 542.285,93', () => {
    const cuota = cuotaFrancesa(CAPITAL, TASA_MENSUAL, CUOTAS).toDecimalPlaces(2);
    expect(cuota.toFixed(2)).toBe('542285.93');
  });

  it('con tasa cero reparte el capital sin dividir entre cero', () => {
    expect(cuotaFrancesa(CAPITAL, 0, CUOTAS).toFixed(2)).toBe('416666.67');
  });

  it('con una sola cuota cobra el capital mas su interes', () => {
    expect(cuotaFrancesa(1000, 0.02, 1).toFixed(2)).toBe('1020.00');
  });

  it('la suma de los abonos a capital es exactamente el capital', () => {
    const tabla = tablaFrancesa(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(sumar(tabla, 'abonoCapital')).toBe('15000000.00');
  });

  it('el saldo de la ultima cuota es exactamente cero', () => {
    const tabla = tablaFrancesa(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(tabla[CUOTAS - 1].saldoPosterior).toBe('0.00');
  });
});

describe('sistema aleman', () => {
  it('abona un capital constante de 416.666,67', () => {
    const tabla = tablaAlemana(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(tabla[0].abonoCapital).toBe('416666.67');
  });

  it('produce las cuotas de referencia: 641.666,67 la primera y 422.916,55 la ultima', () => {
    const tabla = tablaAlemana(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(tabla[0].valorCuota).toBe('641666.67');
    expect(tabla[CUOTAS - 1].valorCuota).toBe('422916.55');
  });

  it('la suma de los abonos a capital es exactamente el capital', () => {
    const tabla = tablaAlemana(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(sumar(tabla, 'abonoCapital')).toBe('15000000.00');
  });

  it('el saldo de la ultima cuota es exactamente cero', () => {
    const tabla = tablaAlemana(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(tabla[CUOTAS - 1].saldoPosterior).toBe('0.00');
  });

  it('cobra en total 4.162.500,00 de intereses', () => {
    const tabla = tablaAlemana(CAPITAL, TASA_MENSUAL, CUOTAS);
    expect(sumar(tabla, 'abonoInteres')).toBe('4162500.00');
  });
});

describe('invariante de redondeo en combinaciones variadas', () => {
  const casos = [
    { capital: 15_000_000, tasa: 0.015, cuotas: 36 },
    { capital: 3_333_333, tasa: 0.0207, cuotas: 7 },
    { capital: 180_000_000, tasa: 0.008734, cuotas: 240 },
    { capital: 1_000, tasa: 0, cuotas: 3 },
    { capital: 999_999, tasa: 0.03, cuotas: 1 },
  ];

  it.each(casos)('frances: suma(capital) === P y saldo final 0 con $capital / $tasa / $cuotas', (caso) => {
    const tabla = tablaFrancesa(caso.capital, caso.tasa, caso.cuotas);
    expect(sumar(tabla, 'abonoCapital')).toBe(new Decimal(caso.capital).toFixed(2));
    expect(tabla[caso.cuotas - 1].saldoPosterior).toBe('0.00');
  });

  it.each(casos)('aleman: suma(capital) === P y saldo final 0 con $capital / $tasa / $cuotas', (caso) => {
    const tabla = tablaAlemana(caso.capital, caso.tasa, caso.cuotas);
    expect(sumar(tabla, 'abonoCapital')).toBe(new Decimal(caso.capital).toFixed(2));
    expect(tabla[caso.cuotas - 1].saldoPosterior).toBe('0.00');
  });
});
