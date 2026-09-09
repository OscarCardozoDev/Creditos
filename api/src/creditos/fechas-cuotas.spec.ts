import { aFechaISO, sumarMeses } from './fechas-cuotas';

describe('sumarMeses', () => {
  it('suma meses dentro del mismo mes destino sin ajustes', () => {
    expect(aFechaISO(sumarMeses(new Date('2026-01-15T00:00:00Z'), 1))).toBe('2026-02-15');
  });

  it('recorta al ultimo dia del mes destino cuando el dia de origen no existe', () => {
    expect(aFechaISO(sumarMeses(new Date('2026-01-31T00:00:00Z'), 1))).toBe('2026-02-28');
  });

  it('respeta el ano bisiesto al recortar febrero', () => {
    expect(aFechaISO(sumarMeses(new Date('2028-01-31T00:00:00Z'), 1))).toBe('2028-02-29');
  });

  it('encadena varios meses consecutivos sin arrastrar el recorte anterior', () => {
    const base = new Date('2026-01-31T00:00:00Z');
    expect(aFechaISO(sumarMeses(base, 2))).toBe('2026-03-31');
    expect(aFechaISO(sumarMeses(base, 3))).toBe('2026-04-30');
  });

  it('cruza el fin de ano', () => {
    expect(aFechaISO(sumarMeses(new Date('2026-11-30T00:00:00Z'), 2))).toBe('2027-01-30');
  });
});
