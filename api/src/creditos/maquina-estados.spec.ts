import { EstadoCredito } from '../entidades/enums';
import { destinosPermitidos, esTransicionValida, TRANSICIONES } from './maquina-estados';

const ESTADOS = Object.values(EstadoCredito);

/** Las 36 combinaciones de origen y destino, para cubrir tambien los saltos invalidos. */
const COMBINACIONES = ESTADOS.flatMap((desde) => ESTADOS.map((hasta) => ({ desde, hasta })));

describe('maquina de estados del credito', () => {
  it.each(COMBINACIONES)('$desde -> $hasta coincide con la tabla', ({ desde, hasta }) => {
    expect(esTransicionValida(desde, hasta)).toBe(TRANSICIONES[desde].includes(hasta));
  });

  it('recorre las 36 combinaciones', () => {
    expect(COMBINACIONES).toHaveLength(36);
  });

  it('los estados terminales no tienen ningun destino', () => {
    expect(destinosPermitidos(EstadoCredito.RECHAZADO)).toEqual([]);
    expect(destinosPermitidos(EstadoCredito.DESEMBOLSADO)).toEqual([]);
    expect(destinosPermitidos(EstadoCredito.CANCELADO)).toEqual([]);
  });

  it('rechaza el cambio al mismo estado: no es un cambio y ensuciaria la bitacora', () => {
    ESTADOS.forEach((estado) => expect(esTransicionValida(estado, estado)).toBe(false));
  });

  it('prohibe el salto de RECHAZADO a DESEMBOLSADO', () => {
    expect(esTransicionValida(EstadoCredito.RECHAZADO, EstadoCredito.DESEMBOLSADO)).toBe(false);
  });

  it('se aprueba directo desde SOLICITADO, sin pasar por el estudio', () => {
    expect(esTransicionValida(EstadoCredito.SOLICITADO, EstadoCredito.APROBADO)).toBe(true);
    expect(esTransicionValida(EstadoCredito.SOLICITADO, EstadoCredito.EN_ESTUDIO)).toBe(false);
  });

  it('un credito que quedo EN_ESTUDIO antes del cambio todavia puede cerrarse', () => {
    expect(destinosPermitidos(EstadoCredito.EN_ESTUDIO)).toEqual([
      EstadoCredito.APROBADO,
      EstadoCredito.RECHAZADO,
      EstadoCredito.CANCELADO,
    ]);
  });
});
