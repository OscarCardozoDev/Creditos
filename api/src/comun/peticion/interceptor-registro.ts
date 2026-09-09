import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { requestIdActual } from './contexto-peticion';

const CAMPOS_SENSIBLES = ['password', 'contrasena', 'clave', 'token', 'csrfToken', 'passwordHash'];

/** Reemplaza por [REDACTADO] cualquier campo sensible antes de que llegue a una linea de log. */
function redactar(valor: unknown): unknown {
  if (!valor || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(redactar);
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([k, v]) =>
      CAMPOS_SENSIBLES.some((s) => k.toLowerCase().includes(s.toLowerCase())) ? [k, '[REDACTADO]'] : [k, redactar(v)],
    ),
  );
}

/** Registra cada peticion en JSON con su requestId, sin contrasenas, cookies ni cabeceras de acceso. */
@Injectable()
export class InterceptorRegistro implements NestInterceptor {
  private readonly registro = new Logger('Peticion');

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    const respuesta = contexto.switchToHttp().getResponse<Response>();
    const inicio = Date.now();
    const esAcceso = peticion.originalUrl.includes('/auth/login');

    return siguiente.handle().pipe(
      tap({
        next: () => this.escribir(peticion, respuesta.statusCode, inicio, esAcceso),
        error: (e: { status?: number }) => this.escribir(peticion, e?.status ?? 500, inicio, esAcceso),
      }),
    );
  }

  /** Emite una linea estructurada por peticion; el cuerpo de un acceso nunca se registra. */
  private escribir(peticion: Request, estado: number, inicio: number, esAcceso: boolean) {
    this.registro.log(
      JSON.stringify({
        requestId: requestIdActual(),
        metodo: peticion.method,
        ruta: peticion.originalUrl,
        estado,
        ms: Date.now() - inicio,
        cuerpo: esAcceso ? '[REDACTADO]' : redactar(peticion.body),
      }),
    );
  }
}
