import { firmar, firmasIguales } from './firma';

describe('firmar', () => {
  it('siempre da la misma firma para el mismo cuerpo y secreto', () => {
    const a = firmar('{"a":1}', 'secreto');
    const b = firmar('{"a":1}', 'secreto');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('cambia si cambia el cuerpo o el secreto', () => {
    const base = firmar('{"a":1}', 'secreto');
    expect(firmar('{"a":2}', 'secreto')).not.toBe(base);
    expect(firmar('{"a":1}', 'otro')).not.toBe(base);
  });
});

describe('firmasIguales', () => {
  it('reconoce dos firmas iguales', () => {
    const firma = firmar('cuerpo', 'secreto');
    expect(firmasIguales(firma, firma)).toBe(true);
  });

  it('rechaza firmas de distinto largo sin lanzar', () => {
    expect(firmasIguales('sha256=abc', 'sha256=abcdef')).toBe(false);
  });

  it('rechaza firmas del mismo largo pero distintas', () => {
    const a = firmar('cuerpo-a', 'secreto');
    const b = firmar('cuerpo-b', 'secreto');
    expect(firmasIguales(a, b)).toBe(false);
  });
});
