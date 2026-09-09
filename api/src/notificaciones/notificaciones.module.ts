import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoWebhookRecibido } from '../entidades/evento-webhook-recibido.entidad';
import { Notificacion } from '../entidades/notificacion.entidad';
import { EntregaService } from './entrega.service';
import { EntregaTarea } from './entrega.tarea';
import { NotificacionesRepository } from './notificaciones.repository';

/** Modulo de la bandeja de salida transaccional y su proceso de entrega por HTTP. */
@Module({
  imports: [TypeOrmModule.forFeature([Notificacion, EventoWebhookRecibido])],
  providers: [NotificacionesRepository, EntregaService, EntregaTarea],
  exports: [NotificacionesRepository],
})
export class NotificacionesModule {}
