import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { RespuestaPaginada } from '../dto/paginacion.dto';

/** Envuelve toda salida exitosa en {success, data, meta}, simetrica al formato de error. */
@Injectable()
export class InterceptorRespuesta implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const respuesta = contexto.switchToHttp().getResponse<Response>();

    return siguiente.handle().pipe(
      map((valor: unknown) => {
        if (respuesta.statusCode === 204 || valor === undefined) return valor;
        if (valor instanceof RespuestaPaginada) return { success: true, data: valor.data, meta: valor.meta };
        return { success: true, data: valor };
      }),
    );
  }
}
