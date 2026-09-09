import { ValueTransformer } from 'typeorm';

/** Mantiene montos y tasas como texto en la aplicacion: el driver los devolveria como float. */
export const decimalATexto: ValueTransformer = {
  to: (valor: string | number | null) => valor,
  from: (valor: string | number | null) => (valor === null || valor === undefined ? null : String(valor)),
};
