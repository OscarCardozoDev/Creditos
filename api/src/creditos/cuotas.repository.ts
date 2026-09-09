import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Cuota } from '../entidades/cuota.entidad';
import { EstadoCuota } from '../entidades/enums';

@Injectable()
export class CuotasRepository {
  constructor(@InjectRepository(Cuota) private readonly repo: Repository<Cuota>) {}

  /** Inserta el plan de amortizacion completo, dentro de la transaccion que lo aprueba. */
  async crearPlan(cuotas: Partial<Cuota>[], gestor: EntityManager): Promise<void> {
    const repo = gestor.getRepository(Cuota);
    await repo.save(repo.create(cuotas));
  }

  /** Devuelve el plan de un credito ordenado por numero de cuota. */
  listarPorCredito(creditoId: string): Promise<Cuota[]> {
    return this.repo.find({ where: { creditoId }, order: { numeroCuota: 'ASC' } });
  }

  /** Devuelve una cuota concreta del plan, o null si ese numero no existe. */
  buscarPorNumero(creditoId: string, numeroCuota: number, gestor?: EntityManager): Promise<Cuota | null> {
    const repo = gestor ? gestor.getRepository(Cuota) : this.repo;
    return repo.findOneBy({ creditoId, numeroCuota });
  }

  /** Marca la cuota como pagada con su fecha y su valor. */
  async registrarPago(cuotaId: string, fechaPago: string, valorPagado: number, gestor: EntityManager): Promise<void> {
    await gestor
      .getRepository(Cuota)
      .update({ cuotaId }, { estado: EstadoCuota.PAGADA, fechaPago, valorPagado: String(valorPagado) });
  }

  /** Anula las cuotas que siguen pendientes. Se usa al cancelar un credito ya aprobado. */
  async anularPendientes(creditoId: string, gestor: EntityManager): Promise<number> {
    const resultado = await gestor
      .getRepository(Cuota)
      .update({ creditoId, estado: EstadoCuota.PENDIENTE }, { estado: EstadoCuota.ANULADA });
    return resultado.affected ?? 0;
  }

  /**
   * Promedio de dias entre el vencimiento y el pago real, o null si aun no ha pagado ninguna.
   * Es un resultado y no un hecho: se deriva de las cuotas y no se guarda en Creditos.
   */
  async diasPromedioPago(creditoId: string): Promise<number | null> {
    const filas = await this.repo.query<{ promedio: number | null }[]>(
      `SELECT AVG(CAST(DATEDIFF(day, fecha_vencimiento, fecha_pago) AS DECIMAL(9,2))) AS promedio
       FROM dbo.Cuotas
       WHERE credito_id = @0 AND fecha_pago IS NOT NULL`,
      [creditoId],
    );
    const promedio = filas[0]?.promedio;
    return promedio === null || promedio === undefined ? null : Number(promedio);
  }
}
