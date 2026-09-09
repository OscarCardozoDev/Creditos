import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Credito } from '../entidades/credito.entidad';
import { Cuota } from '../entidades/cuota.entidad';
import { HistorialModule } from '../historial/historial.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { WebhookCreditosController } from '../notificaciones/webhook-creditos.controller';
import { SimulacionModule } from '../simulacion/simulacion.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CreditosController } from './creditos.controller';
import { CreditosRepository } from './creditos.repository';
import { CreditosService } from './creditos.service';
import { CuotasRepository } from './cuotas.repository';

/**
 * Modulo del ciclo de vida de la solicitud de credito. Tambien declara el receptor del webhook
 * (fisicamente en notificaciones/, porque es su dominio): necesita CreditosService, que solo
 * este modulo expone, y evita asi un import circular entre creditos y notificaciones.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Credito, Cuota]),
    UsuariosModule,
    SimulacionModule,
    HistorialModule,
    NotificacionesModule,
  ],
  controllers: [CreditosController, WebhookCreditosController],
  providers: [CreditosService, CreditosRepository, CuotasRepository],
})
export class CreditosModule {}
