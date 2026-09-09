import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Credito } from './credito.entidad';
import { EstadoNotificacion, EventoNotificacion, listaSql } from './enums';

/** Bandeja de salida: la fila se escribe en la transaccion del credito y un worker la entrega. */
@Entity('Notificaciones')
@Unique('UQ_Notif_Event', ['eventId'])
@Index('IX_Notif_Pendientes', ['proximoIntento'], { where: `estado = '${EstadoNotificacion.PENDIENTE}'` })
@Check('CK_Notif_Evento', `evento IN (${listaSql(EventoNotificacion)})`)
@Check('CK_Notif_Estado', `estado IN (${listaSql(EstadoNotificacion)})`)
@Check('CK_Notif_Payload', 'ISJSON(payload) = 1')
export class Notificacion {
  @PrimaryGeneratedColumn({ name: 'notificacion_id', type: 'bigint', primaryKeyConstraintName: 'PK_Notificaciones' })
  notificacionId: string;

  /** Clave de idempotencia del receptor: un reintento entrega el mismo eventId. */
  @Column({ name: 'event_id', type: 'uniqueidentifier', default: () => 'NEWID()' })
  eventId: string;

  @Column({ name: 'credito_id', type: 'uniqueidentifier' })
  creditoId: string;

  @ManyToOne(() => Credito)
  @JoinColumn({ name: 'credito_id', foreignKeyConstraintName: 'FK_Notif_Credito' })
  credito: Credito;

  @Column({ name: 'evento', type: 'varchar', length: 30 })
  evento: EventoNotificacion;

  /** JSON exacto que se envio; no se reconstruye al consultarlo. */
  @Column({ name: 'payload', type: 'nvarchar', length: 'MAX' })
  payload: string;

  @Column({ name: 'estado', type: 'varchar', length: 10, default: () => `'${EstadoNotificacion.PENDIENTE}'` })
  estado: EstadoNotificacion;

  @Column({ name: 'intentos', type: 'int', default: () => '0' })
  intentos: number;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'ultimo_error', type: 'nvarchar', length: 500, nullable: true })
  ultimoError: string | null;

  @Column({ name: 'proximo_intento', type: 'datetime2', precision: 3, nullable: true })
  proximoIntento: Date | null;

  @Column({ name: 'enviado_en', type: 'datetime2', precision: 3, nullable: true })
  enviadoEn: Date | null;

  @Column({ name: 'creado_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  creadoEn: Date;
}
