import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { CODIGOS, CodigoError } from './codigos-error';
import { requestIdActual } from '../peticion/contexto-peticion';
import { traducirErrorSql } from './errores-sql';
import { ExcepcionDominio } from './excepciones';

/** Unica salida de errores de la API. Ningun controlador arma una respuesta de error. */
@Catch()
export class FiltroExcepciones implements ExceptionFilter {
  private readonly registro = new Logger('Error');

  catch(excepcion: unknown, host: ArgumentsHost) {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const { estado, codigo, mensaje, detalles } = this.clasificar(excepcion);

    if (estado >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.registro.error({ requestId: requestIdActual(), codigo, excepcion });
    }

    respuesta.status(estado).json({
      success: false,
      error: { code: codigo, message: mensaje, details: detalles, requestId: requestIdActual() },
    });
  }

  /** Reduce cualquier excepcion a un codigo del catalogo, sin filtrar trazas ni nombres de tabla. */
  private clasificar(excepcion: unknown): {
    estado: HttpStatus;
    codigo: CodigoError;
    mensaje: string;
    detalles: unknown[];
  } {
    if (excepcion instanceof ExcepcionDominio) {
      return {
        estado: CODIGOS[excepcion.codigo],
        codigo: excepcion.codigo,
        mensaje: excepcion.message,
        detalles: excepcion.detalles,
      };
    }

    if (excepcion instanceof ThrottlerException) {
      return {
        estado: CODIGOS.DEMASIADAS_PETICIONES,
        codigo: 'DEMASIADAS_PETICIONES',
        mensaje: 'Demasiadas peticiones. Intente de nuevo en unos segundos.',
        detalles: [],
      };
    }

    const traducido = traducirErrorSql(excepcion);
    if (traducido) {
      return { estado: CODIGOS[traducido.codigo], codigo: traducido.codigo, mensaje: traducido.mensaje, detalles: [] };
    }

    if (excepcion instanceof HttpException) {
      const cuerpo = excepcion.getResponse() as string | { message?: string | string[] };
      const estado = excepcion.getStatus();
      const detalles = typeof cuerpo === 'object' && Array.isArray(cuerpo.message) ? cuerpo.message : [];
      const mensaje =
        typeof cuerpo === 'string'
          ? cuerpo
          : ((Array.isArray(cuerpo.message) ? 'Los datos enviados no son validos.' : cuerpo.message) ??
            excepcion.message);
      return { estado, codigo: this.codigoPorEstado(estado), mensaje, detalles };
    }

    return {
      estado: HttpStatus.INTERNAL_SERVER_ERROR,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrio un error inesperado. El detalle quedo en el registro del servidor.',
      detalles: [],
    };
  }

  /** Codigo generico para las excepciones HTTP que Nest lanza por su cuenta. */
  private codigoPorEstado(estado: HttpStatus): CodigoError {
    switch (estado) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'NO_AUTENTICADO';
      case HttpStatus.FORBIDDEN:
        return 'SIN_PERMISO';
      case HttpStatus.NOT_FOUND:
        return 'RECURSO_NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'DEMASIADAS_PETICIONES';
      default:
        return 'ERROR_INTERNO';
    }
  }
}
