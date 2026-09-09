import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EstadoCredito } from '../entidades/enums';
import { HistorialCredito } from '../entidades/historial-credito.entidad';

/** Datos de un asiento de la bitacora. `usuarioNombre` es copia del momento, no un enlace. */
export interface AsientoHistorial {
  creditoId: string;
  estadoAnterior: EstadoCredito | null;
  estadoNuevo: EstadoCredito;
  usuarioId: string | null;
  usuarioNombre: string;
  observacion?: string | null;
}

/**
 * Solo expone `registrar` y `listarDeCredito`. La ausencia de actualizar y borrar es deliberada:
 * una bitacora que se puede editar deja de ser una bitacora.
 */
@Injectable()
export class HistorialRepository {
  constructor(@InjectRepository(HistorialCredito) private readonly repo: Repository<HistorialCredito>) {}

  /** Agrega un asiento, siempre dentro de la transaccion del cambio que lo origina. */
  async registrar(asiento: AsientoHistorial, gestor: EntityManager): Promise<void> {
    const repo = gestor.getRepository(HistorialCredito);
    await repo.save(repo.create(asiento));
  }

  /** Devuelve la bitacora de un credito, de la mas reciente a la mas antigua. */
  listarDeCredito(creditoId: string): Promise<HistorialCredito[]> {
    return this.repo.find({ where: { creditoId }, order: { fecha: 'DESC', historialId: 'DESC' } });
  }
}
