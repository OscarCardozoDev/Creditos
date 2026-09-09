import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { EntityManager, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { resolverOrden } from '../comun/dto/paginacion.dto';
import { Credito } from '../entidades/credito.entidad';
import { EstadoCredito, TipoCredito, TipoUsuario } from '../entidades/enums';
import { ConsultarCreditosDto } from './dto/consultar-creditos.dto';

/** Estados en los que una solicitud sigue viva y por tanto no admite otra equivalente. */
const ESTADOS_VIVOS = [EstadoCredito.SOLICITADO, EstadoCredito.EN_ESTUDIO];

/** Campos por los que se puede ordenar. El nombre de columna no se puede parametrizar. */
const ORDENABLES: Record<string, string> = {
  fechaSolicitud: 'c.fechaSolicitud',
  valorSolicitado: 'c.valorSolicitado',
  tasaInteres: 'c.tasaInteres',
  numeroCuotas: 'c.numCuotas',
  estado: 'c.estado',
  numeroCredito: 'c.numCredito',
};

/** Quien pide, para que el repositorio pueda imponerle su filtro de visibilidad. */
export interface Solicitante {
  usuarioId: string;
  rol: TipoUsuario;
}

@Injectable()
export class CreditosRepository {
  constructor(@InjectRepository(Credito) private readonly repo: Repository<Credito>) {}

  /** Devuelve el credito con su deudor si el solicitante puede verlo, o null. */
  buscarPorId(creditoId: string, solicitante: Solicitante, gestor?: EntityManager): Promise<Credito | null> {
    const query = this.consultaBase(gestor).andWhere('c.creditoId = :creditoId', { creditoId });
    this.aplicarFiltroPorRol(query, solicitante);
    return query.getOne();
  }

  /** Dice si el credito existe y no esta borrado, sin mirar de quien es. */
  async existeParaCualquiera(creditoId: string): Promise<boolean> {
    const cuantos = await this.repo.count({ where: { creditoId, eliminadoEn: IsNull() } });
    return cuantos > 0;
  }

  /** Devuelve la pagina de creditos que pide la consulta y el total que la cumple. */
  listar(consulta: ConsultarCreditosDto, solicitante: Solicitante): Promise<[Credito[], number]> {
    const query = this.consultaBase();
    this.aplicarFiltroPorRol(query, solicitante);
    this.aplicarFiltros(query, consulta);
    this.aplicarOrden(query, consulta.sort);
    this.aplicarPagina(query, consulta.page, consulta.limit);
    return query.getManyAndCount();
  }

  /** Cuenta cuantos creditos vivos hay en cada estado y suma su valor solicitado, para el tablero. */
  async contarPorEstado(
    solicitante: Solicitante,
  ): Promise<{ estado: EstadoCredito; total: number; montoSolicitado: string }[]> {
    const query = this.repo
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(c.valorSolicitado)', 'montoSolicitado')
      .where('c.eliminadoEn IS NULL')
      .groupBy('c.estado');

    this.aplicarFiltroPorRol(query, solicitante);
    const filas = await query.getRawMany<{ estado: EstadoCredito; total: number; montoSolicitado: string | number }>();
    return filas.map((fila) => ({
      estado: fila.estado,
      total: Number(fila.total),
      montoSolicitado: new Decimal(fila.montoSolicitado).toFixed(2),
    }));
  }

  /** Dice si el asociado ya tiene una solicitud viva del mismo tipo y valor. */
  async existeDuplicado(
    deudorId: string,
    tipoCredito: TipoCredito,
    valorSolicitado: string,
    gestor: EntityManager,
  ): Promise<boolean> {
    const cuantos = await gestor.getRepository(Credito).count({
      where: { deudorId, tipoCredito, valorSolicitado, estado: In(ESTADOS_VIVOS), eliminadoEn: IsNull() },
    });
    return cuantos > 0;
  }

  /** Pide el siguiente consecutivo a la secuencia de la base, dentro de la transaccion en curso. */
  async siguienteNumeroCredito(gestor: EntityManager): Promise<string> {
    const filas = await gestor.query<{ n: number }[]>('SELECT NEXT VALUE FOR dbo.Seq_NumCredito AS n');
    const consecutivo = String(filas[0].n).padStart(6, '0');
    return `CR-${new Date().getUTCFullYear()}-${consecutivo}`;
  }

  /** Inserta el credito dentro de la transaccion recibida. */
  crear(datos: Partial<Credito>, gestor: EntityManager): Promise<Credito> {
    const repo = gestor.getRepository(Credito);
    return repo.save(repo.create(datos));
  }

  /**
   * Escribe los cambios solo si la fila sigue en la version leida, y devuelve si lo consiguio.
   * La deteccion del conflicto ocurre en la misma escritura: sin bloqueos ni lecturas previas.
   */
  async actualizarSiVersionCoincide(
    creditoId: string,
    versionLeida: Buffer,
    cambios: Record<string, unknown>,
    gestor: EntityManager,
  ): Promise<boolean> {
    const resultado = await gestor
      .createQueryBuilder()
      .update(Credito)
      .set({ ...cambios, fechaActualizacion: () => 'SYSUTCDATETIME()' })
      .where('credito_id = :creditoId', { creditoId })
      .andWhere('row_version = :version', { version: versionLeida })
      .execute();

    return (resultado.affected ?? 0) > 0;
  }

  /** Marca el credito como borrado. La fila permanece: aqui nada se elimina fisicamente. */
  async borradoLogico(creditoId: string): Promise<boolean> {
    const resultado = await this.repo.update({ creditoId, eliminadoEn: IsNull() }, { eliminadoEn: new Date() });
    return (resultado.affected ?? 0) > 0;
  }

  /** Consulta base: siempre con el deudor unido y siempre sin los borrados. */
  private consultaBase(gestor?: EntityManager): SelectQueryBuilder<Credito> {
    const repo = gestor ? gestor.getRepository(Credito) : this.repo;
    return repo.createQueryBuilder('c').innerJoinAndSelect('c.deudor', 'd').where('c.eliminadoEn IS NULL');
  }

  /** Al ASOCIADO le impone ver solo lo suyo. Va aqui para que ninguna consulta futura lo olvide. */
  private aplicarFiltroPorRol(query: SelectQueryBuilder<Credito>, solicitante: Solicitante): void {
    if (solicitante.rol === TipoUsuario.ASOCIADO) {
      query.andWhere('c.deudorId = :propio', { propio: solicitante.usuarioId });
    }
  }

  /** Anade a la consulta las condiciones que el cliente pidio. */
  private aplicarFiltros(query: SelectQueryBuilder<Credito>, consulta: ConsultarCreditosDto): void {
    if (consulta.estado) {
      query.andWhere('c.estado = :estado', { estado: consulta.estado });
    }
    if (consulta.tipoCredito) {
      query.andWhere('c.tipoCredito = :tipo', { tipo: consulta.tipoCredito });
    }
    if (consulta.identificacion) {
      query.andWhere('d.identificacion = :ident', { ident: consulta.identificacion });
    }
    if (consulta.desde) {
      query.andWhere('c.fechaSolicitud >= :desde', { desde: new Date(consulta.desde) });
    }
    if (consulta.hasta) {
      query.andWhere('c.fechaSolicitud <= :hasta', { hasta: new Date(consulta.hasta) });
    }
    if (consulta.q) {
      query.andWhere('(c.numCredito LIKE :q OR d.nombreRazonSocial LIKE :q)', { q: `%${consulta.q}%` });
    }
  }

  /** Ordena la consulta por un campo de la lista blanca, o por fecha de solicitud. */
  private aplicarOrden(query: SelectQueryBuilder<Credito>, sort?: string): void {
    const orden = resolverOrden(sort, ORDENABLES, { columna: 'c.fechaSolicitud', direccion: 'DESC' });
    query.orderBy(orden.columna, orden.direccion);
  }

  /** Limita la consulta a la pagina pedida. */
  // ponytail: OFFSET/FETCH, pasar a cursor si las paginas profundas llegan a pesar.
  private aplicarPagina(query: SelectQueryBuilder<Credito>, page: number, limit: number): void {
    query.skip((page - 1) * limit).take(limit);
  }
}
