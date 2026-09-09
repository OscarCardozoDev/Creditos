import { HttpException } from '@nestjs/common';
import { CODIGOS, CodigoError } from './codigos-error';

/** Excepcion de dominio: lleva un codigo del catalogo y de ahi sale su estado HTTP. */
export class ExcepcionDominio extends HttpException {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly detalles: unknown[] = [],
  ) {
    super(mensaje, CODIGOS[codigo]);
  }
}

/** Incumple una regla del producto o del perfil del solicitante. */
export class ReglaNegocioException extends ExcepcionDominio {
  constructor(mensaje: string, detalles: unknown[] = []) {
    super('REGLA_NEGOCIO', mensaje, detalles);
  }
}

/** El cambio de estado pedido no sale del estado actual. */
export class TransicionInvalidaException extends ExcepcionDominio {
  constructor(mensaje: string, detalles: unknown[] = []) {
    super('TRANSICION_INVALIDA', mensaje, detalles);
  }
}

/** Ya existe un registro vivo equivalente al que se intenta crear. */
export class DuplicadoException extends ExcepcionDominio {
  constructor(codigo: 'CREDITO_DUPLICADO' | 'USUARIO_DUPLICADO', mensaje: string) {
    super(codigo, mensaje);
  }
}

/** La version enviada en If-Match quedo obsoleta entre la lectura y la escritura. */
export class ConcurrenciaException extends ExcepcionDominio {
  constructor(mensaje = 'El registro cambio desde que se leyo. Vuelva a cargarlo e intente de nuevo.') {
    super('CONCURRENCIA_CONFLICTO', mensaje);
  }
}

/** El recurso no existe, o esta borrado logicamente: para quien consume la API es lo mismo. */
export class NoEncontradoException extends ExcepcionDominio {
  constructor(codigo: 'CREDITO_NOT_FOUND' | 'USUARIO_NOT_FOUND' | 'CUOTA_NOT_FOUND', mensaje: string) {
    super(codigo, mensaje);
  }
}
