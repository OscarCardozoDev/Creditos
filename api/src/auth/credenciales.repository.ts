import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Credencial } from '../entidades/credencial.entidad';

@Injectable()
export class CredencialesRepository {
  constructor(@InjectRepository(Credencial) private readonly repo: Repository<Credencial>) {}

  /** Inserta la credencial, dentro de la transaccion recibida si la hay. */
  crear(datos: Pick<Credencial, 'usuarioId' | 'correo' | 'passwordHash'>, gestor?: EntityManager): Promise<Credencial> {
    const repo = gestor ? gestor.getRepository(Credencial) : this.repo;
    return repo.save(repo.create(datos));
  }

  /** Devuelve la credencial de ese correo con su usuario cargado, o null si no existe. */
  buscarPorCorreo(correo: string): Promise<Credencial | null> {
    return this.repo.findOne({ where: { correo }, relations: { usuario: true } });
  }

  /** Suma uno al contador de intentos fallidos y devuelve el total acumulado. */
  async sumarIntentoFallido(usuarioId: string): Promise<number> {
    await this.repo.increment({ usuarioId }, 'intentosFallidos', 1);
    const credencial = await this.repo.findOneByOrFail({ usuarioId });
    return credencial.intentosFallidos;
  }

  /** Deja la cuenta bloqueada hasta el momento indicado. */
  async bloquearHasta(usuarioId: string, hasta: Date): Promise<void> {
    await this.repo.update({ usuarioId }, { bloqueadoHasta: hasta });
  }

  /** Borra el rastro de intentos fallidos tras un acceso correcto. */
  async limpiarIntentos(usuarioId: string): Promise<void> {
    await this.repo.update({ usuarioId }, { intentosFallidos: 0, bloqueadoHasta: null });
  }
}
