import { AsyncLocalStorage } from 'node:async_hooks';

export interface ContextoPeticion {
  requestId: string;
}

const almacen = new AsyncLocalStorage<ContextoPeticion>();

/** Ejecuta el resto de la peticion con su contexto disponible sin pasarlo por parametro. */
export const conContexto = <T>(contexto: ContextoPeticion, fn: () => T): T => almacen.run(contexto, fn);

/** Devuelve el identificador de la peticion en curso, o '-' fuera de una peticion. */
export const requestIdActual = (): string => almacen.getStore()?.requestId ?? '-';
