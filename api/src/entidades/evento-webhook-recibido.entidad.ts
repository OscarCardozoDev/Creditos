import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Marca de idempotencia: un eventId que ya paso por el receptor del webhook no se procesa otra vez. */
@Entity('EventosWebhookRecibidos')
export class EventoWebhookRecibido {
  @PrimaryColumn({ name: 'event_id', type: 'uniqueidentifier', primaryKeyConstraintName: 'PK_EventosWebhookRecibidos' })
  eventId: string;

  @Column({ name: 'recibido_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  recibidoEn: Date;
}
