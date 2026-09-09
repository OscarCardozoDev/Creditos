import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { resolverOrden } from '../comun/dto/paginacion.dto';
import { Usuario } from '../entidades/usuario.entidad';
import { ConsultarUsuariosDto } from './dto/consultar-usuarios.dto';

/** Campos por los que se puede ordenar. El nombre de columna no se puede parametrizar. */
const ORDENABLES: Record<string, string> = {
  identificacion: 'u.identificacion',
  nombreRazonSocial: 'u.nombreRazonSocial',
  creadoEn: 'u.creadoEn',
};

@Injectable()
export class UsuariosRepository {
  constructor(@InjectRepository(Usuario) private readonly repo: Repository<Usuario>) {}

  /** Busca un usuario por su identificacion, o devuelve null si no existe. */
  buscarPorIdentificacion(identificacion: string, gestor?: EntityManager): Promise<Usuario | null> {
    return this.repositorio(gestor).findOneBy({ identificacion });
  }

  /** Busca un usuario por su identificador, o devuelve null si no existe. */
  buscarPorId(usuarioId: string, gestor?: EntityManager): Promise<Usuario | null> {
    return this.repositorio(gestor).findOneBy({ usuarioId });
  }

  /** Inserta un usuario, dentro de la transaccion recibida si la hay. */
  crear(datos: Partial<Usuario>, gestor?: EntityManager): Promise<Usuario> {
    const repo = this.repositorio(gestor);
    return repo.save(repo.create(datos));
  }

  /** Devuelve la pagina de usuarios que pide la consulta y el total que la cumple. */
  listar(consulta: ConsultarUsuariosDto): Promise<[Usuario[], number]> {
    const query = this.repo.createQueryBuilder('u');
    this.aplicarFiltros(query, consulta);
    this.aplicarOrden(query, consulta.sort);
    this.aplicarPagina(query, consulta.page, consulta.limit);
    return query.getManyAndCount();
  }

  /** Usa el repositorio de la transaccion si la operacion viene dentro de una. */
  private repositorio(gestor?: EntityManager): Repository<Usuario> {
    return gestor ? gestor.getRepository(Usuario) : this.repo;
  }

  /** Anade a la consulta las condiciones que el cliente pidio. */
  private aplicarFiltros(query: SelectQueryBuilder<Usuario>, consulta: ConsultarUsuariosDto): void {
    if (consulta.tipoUsuario) {
      query.andWhere('u.tipoUsuario = :rol', { rol: consulta.tipoUsuario });
    }
    if (consulta.tipoPersona) {
      query.andWhere('u.tipoPersona = :persona', { persona: consulta.tipoPersona });
    }
    if (consulta.q) {
      query.andWhere('(u.identificacion LIKE :q OR u.nombreRazonSocial LIKE :q)', { q: `%${consulta.q}%` });
    }
  }

  /** Ordena la consulta por un campo de la lista blanca, o por fecha de creacion. */
  private aplicarOrden(query: SelectQueryBuilder<Usuario>, sort?: string): void {
    const orden = resolverOrden(sort, ORDENABLES, { columna: 'u.creadoEn', direccion: 'DESC' });
    query.orderBy(orden.columna, orden.direccion);
  }

  /** Limita la consulta a la pagina pedida. */
  private aplicarPagina(query: SelectQueryBuilder<Usuario>, page: number, limit: number): void {
    query.skip((page - 1) * limit).take(limit);
  }
}
