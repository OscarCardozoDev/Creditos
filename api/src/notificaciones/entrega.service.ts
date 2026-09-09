import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notificacion } from '../entidades/notificacion.entidad';
import { firmar } from './firma';
import { NotificacionesRepository } from './notificaciones.repository';
import { esTransitorio, proximoIntento } from './reintentos';

/** Cuantas notificaciones se reclaman por barrido. Fijo: no hay motivo para variarlo hoy. */
const TAMANO_LOTE = 50;

/** Minutos en ENVIANDO antes de considerar que el proceso murio a mitad del envio. */
const MINUTOS_ATASCO = 5;

/** Entrega por HTTP las notificaciones pendientes de la bandeja de salida. */
@Injectable()
export class EntregaService {
  private readonly registro = new Logger('EntregaNotificaciones');

  constructor(
    private readonly repo: NotificacionesRepository,
    private readonly config: ConfigService,
  ) {}

  /** Rescata lo atascado, reclama un lote de pendientes y entrega cada uno. */
  async entregarPendientes(): Promise<void> {
    await this.repo.rescatarAtascadas(MINUTOS_ATASCO);
    const lote = await this.repo.reclamarPendientes(TAMANO_LOTE);
    for (const notificacion of lote) {
      await this.entregarUna(notificacion);
    }
  }

  /** Hace el POST de una notificacion y despacha el desenlace segun lo que responda o falle. */
  private async entregarUna(notificacion: Notificacion): Promise<void> {
    try {
      const respuesta = await this.enviar(notificacion.payload, notificacion.eventId);
      if (respuesta.ok) {
        await this.repo.marcarEnviado(notificacion.notificacionId, respuesta.status);
        return;
      }
      await this.despacharFallo(notificacion, respuesta.status, `El receptor respondio ${respuesta.status}`);
    } catch (error) {
      // Timeout, conexion rechazada o DNS: nunca hay codigo de estado, y siempre es transitorio.
      await this.despacharFallo(notificacion, null, mensajeDe(error));
    }
  }

  /** Hace el POST firmado al webhook configurado; sin seguir redirecciones y con timeout propio. */
  private enviar(payload: string, eventId: string): Promise<Response> {
    const url = this.config.get<string>('WEBHOOK_URL') as string;
    const secreto = this.config.get<string>('WEBHOOK_SECRET') as string;
    const timeoutMs = this.config.get<number>('WEBHOOK_TIMEOUT_MS') as number;
    return fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': firmar(payload, secreto),
        'X-Event-Id': eventId,
      },
      body: payload,
    });
  }

  /** Decide entre reprogramar o dar la notificacion por fallida, segun el error y los intentos que quedan. */
  private async despacharFallo(notificacion: Notificacion, status: number | null, error: string): Promise<void> {
    const maxIntentos = this.config.get<number>('WEBHOOK_MAX_INTENTOS') as number;
    const transitorio = status === null || esTransitorio(status);
    if (transitorio && notificacion.intentos < maxIntentos) {
      await this.repo.reprogramar(notificacion.notificacionId, proximoIntento(notificacion.intentos), status, error);
      return;
    }
    await this.repo.marcarFallido(notificacion.notificacionId, status, error);
    this.registro.warn(`Notificacion ${notificacion.notificacionId} quedo FALLIDO: ${error}`);
  }
}

/** Reduce cualquier error de fetch a un texto legible para guardar en la columna de error. */
function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
