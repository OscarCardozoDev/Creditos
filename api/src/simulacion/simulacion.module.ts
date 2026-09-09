import { Module } from '@nestjs/common';
import { SimulacionController } from './simulacion.controller';
import { SimulacionService } from './simulacion.service';

/** Modulo puro: no importa nada mas del proyecto. Exporta el servicio para que creditos lo use. */
@Module({
  controllers: [SimulacionController],
  providers: [SimulacionService],
  exports: [SimulacionService],
})
export class SimulacionModule {}
