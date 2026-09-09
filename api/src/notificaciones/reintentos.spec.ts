import { esTransitorio, proximoIntento } from './reintentos';

describe('esTransitorio', () => {
  it.each([500, 502, 503, 408, 429])('%i es transitorio', (status) => {
    expect(esTransitorio(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422])('%i no es transitorio', (status) => {
    expect(esTransitorio(status)).toBe(false);
  });
});

describe('proximoIntento', () => {
  it('crece exponencialmente con el numero de intentos', () => {
    const ahora = Date.now();
    const uno = proximoIntento(1).getTime() - ahora;
    const dos = proximoIntento(2).getTime() - ahora;
    const tres = proximoIntento(3).getTime() - ahora;
    // Con la dispersion aleatoria el piso de cada intento sigue el doble del anterior.
    expect(uno).toBeGreaterThanOrEqual(1000);
    expect(dos).toBeGreaterThanOrEqual(2000);
    expect(tres).toBeGreaterThanOrEqual(4000);
  });

  it('nunca da dos veces el mismo retraso: la dispersion aleatoria evita la avalancha', () => {
    const valores = new Set(Array.from({ length: 20 }, () => proximoIntento(3).getTime()));
    expect(valores.size).toBeGreaterThan(1);
  });
});
