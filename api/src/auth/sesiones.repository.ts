import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { MotivoRevocacion } from '../entidades/enums';
import { Sesion } from '../entidades/sesion.entidad';

@Injectable()
export class SesionesRepository {
  constructor(@InjectRepository(Sesion) private readonly repo: Repository<Sesion>) {}

  /** Guarda una sesion nueva. */
  crear(datos: Partial<Sesion>): Promise<Sesion> {
    return this.repo.save(this.repo.create(datos));
  }

  /** Devuelve la sesion con su usuario cargado, o null si el hash no corresponde a ninguna. */
  buscarConUsuario(tokenHash: string): Promise<Sesion | null> {
    return this.repo.findOne({ where: { tokenHash }, relations: { usuario: true } });
  }

  /** Devuelve las sesiones vivas de un usuario, de la mas reciente a la mas antigua. */
  listarActivas(usuarioId: string): Promise<Sesion[]> {
    return this.repo.find({
      where: { usuarioId, revocadaEn: IsNull() },
      order: { ultimoAcceso: 'DESC' },
    });
  }

  /** Marca una sesion como revocada con el motivo por el que se cerro. */
  async revocar(tokenHash: string, motivo: MotivoRevocacion): Promise<void> {
    await this.repo.update({ tokenHash, revocadaEn: IsNull() }, { revocadaEn: new Date(), motivoRevocacion: motivo });
  }

  /** Marca como revocadas todas las sesiones vivas de un usuario. */
  async revocarTodasDe(usuarioId: string, motivo: MotivoRevocacion): Promise<void> {
    await this.repo.update({ usuarioId, revocadaEn: IsNull() }, { revocadaEn: new Date(), motivoRevocacion: motivo });
  }

  /** Guarda la marca de ultimo acceso de una sesion. */
  async tocarUltimoAcceso(tokenHash: string, momento: Date): Promise<void> {
    await this.repo.update({ tokenHash }, { ultimoAcceso: momento });
  }

  /** Borra las sesiones que vencieron antes de la fecha dada. Lo usa la limpieza programada. */
  async borrarVencidasAntesDe(fecha: Date): Promise<number> {
    const resultado = await this.repo.delete({ expiraEn: LessThan(fecha) });
    return resultado.affected ?? 0;
  }
}
