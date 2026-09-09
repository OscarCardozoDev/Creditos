import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistorialCredito } from '../entidades/historial-credito.entidad';
import { HistorialRepository } from './historial.repository';

/** Modulo de la bitacora append-only. Expone el repositorio para que creditos lo use. */
@Module({
  imports: [TypeOrmModule.forFeature([HistorialCredito])],
  providers: [HistorialRepository],
  exports: [HistorialRepository],
})
export class HistorialModule {}
