import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EventoWebhookRecibido } from '../entidades/evento-webhook-recibido.entidad';
import { EstadoNotificacion } from '../entidades/enums';
import { Notificacion } from '../entidades/notificacion.entidad';
import { CuerpoEvento } from './eventos';

@Injectable()
export class NotificacionesRepository {
  constructor(
    @InjectRepository(Notificacion) private readonly repo: Repository<Notificacion>,
    @InjectRepository(EventoWebhookRecibido) private readonly recibidos: Repository<EventoWebhookRecibido>,
  ) {}

  /**
   * Deja el evento en la bandeja de salida, dentro de la transaccion del cambio que lo origina.
   * Nunca se llama al sistema externo desde aqui: eso lo hace despues el proceso de entrega.
   */
  async encolar(creditoId: string, cuerpo: CuerpoEvento, gestor: EntityManager): Promise<void> {
    const repo = gestor.getRepository(Notificacion);
    await repo.save(
      repo.create({
        creditoId,
        eventId: cuerpo.eventId,
        evento: cuerpo.event,
        // Se guarda el JSON exacto que saldra: si manana cambia el formato, la traza no se reescribe.
        payload: JSON.stringify(cuerpo),
      }),
    );
  }

  /** Devuelve las notificaciones de un credito, de la mas reciente a la mas antigua. */
  listarPorCredito(creditoId: string): Promise<Notificacion[]> {
    return this.repo.find({ where: { creditoId }, order: { notificacionId: 'DESC' } });
  }

  /**
   * Reclama un lote de pendientes de forma atomica: OUTPUT reclama y lee en una sola operacion,
   * sin ventana entre ambas, y READPAST hace que cada replica salte las filas que otra ya
   * bloqueo en vez de esperarlas. Asi varias instancias de la API no envian el mismo evento dos veces.
   */
  async reclamarPendientes(cantidad: number): Promise<Notificacion[]> {
    const filas = await this.repo.manager.query<Record<string, unknown>[]>(
      `UPDATE TOP (@0) dbo.Notificaciones WITH (ROWLOCK, READPAST)
       SET estado = 'ENVIANDO', intentos = intentos + 1
       OUTPUT inserted.*
       WHERE estado = 'PENDIENTE'
         AND (proximo_intento IS NULL OR proximo_intento <= SYSUTCDATETIME())`,
      [cantidad],
    );
    return filas.map((fila) => this.mapearFila(fila));
  }

  /**
   * Devuelve a PENDIENTE lo que lleva mas de N minutos en ENVIANDO: el proceso que lo reclamo
   * murio a mitad del envio y, sin esto, esa fila queda atascada para siempre.
   */
  async rescatarAtascadas(minutos: number): Promise<void> {
    await this.repo.manager.query(
      `UPDATE dbo.Notificaciones SET estado = 'PENDIENTE'
       WHERE estado = 'ENVIANDO' AND creado_en <= DATEADD(MINUTE, -@0, SYSUTCDATETIME())`,
      [minutos],
    );
  }

  /** Cierra la notificacion con exito: queda ENVIADO con la fecha y el codigo de respuesta. */
  async marcarEnviado(notificacionId: string, httpStatus: number): Promise<void> {
    await this.repo.update(notificacionId, {
      estado: EstadoNotificacion.ENVIADO,
      httpStatus,
      enviadoEn: new Date(),
    });
  }

  /** Cierra la notificacion sin exito y sin mas reintentos: agoto los intentos o el error no es transitorio. */
  async marcarFallido(notificacionId: string, httpStatus: number | null, error: string): Promise<void> {
    await this.repo.update(notificacionId, {
      estado: EstadoNotificacion.FALLIDO,
      httpStatus,
      ultimoError: recortar(error),
    });
  }

  /** Vuelve la notificacion a PENDIENTE con la fecha del proximo intento, para que el worker la retome. */
  async reprogramar(
    notificacionId: string,
    proximoIntento: Date,
    httpStatus: number | null,
    error: string,
  ): Promise<void> {
    await this.repo.update(notificacionId, {
      estado: EstadoNotificacion.PENDIENTE,
      proximoIntento,
      httpStatus,
      ultimoError: recortar(error),
    });
  }

  /**
   * Reclama el eventId de un webhook entrante de forma atomica: si ya existe, la restriccion
   * unica de la llave primaria rechaza el INSERT y ahi se sabe que es un reintento duplicado.
   */
  async intentarMarcarRecibido(eventId: string): Promise<boolean> {
    try {
      await this.recibidos.insert({ eventId });
      return true;
    } catch {
      // ponytail: cualquier fallo de insert se trata como duplicado; alcanza para el volumen actual.
      return false;
    }
  }

  /** Libera la marca si el procesamiento fallo: un reintento legitimo debe poder volver a intentarlo. */
  async liberarMarcaRecibido(eventId: string): Promise<void> {
    await this.recibidos.delete({ eventId });
  }

  /** Convierte una fila cruda del OUTPUT (columnas snake_case) a la forma de la entidad. */
  private mapearFila(fila: Record<string, unknown>): Notificacion {
    const n = new Notificacion();
    n.notificacionId = String(fila.notificacion_id);
    n.eventId = fila.event_id as string;
    n.creditoId = fila.credito_id as string;
    n.evento = fila.evento as Notificacion['evento'];
    n.payload = fila.payload as string;
    n.estado = fila.estado as Notificacion['estado'];
    n.intentos = fila.intentos as number;
    n.httpStatus = fila.http_status as number | null;
    n.ultimoError = fila.ultimo_error as string | null;
    n.proximoIntento = fila.proximo_intento as Date | null;
    n.enviadoEn = fila.enviado_en as Date | null;
    n.creadoEn = fila.creado_en as Date;
    return n;
  }
}

/** Recorta el mensaje de error a lo que cabe en la columna: nunca se guarda una traza completa. */
function recortar(error: string): string {
  return error.slice(0, 500);
}
