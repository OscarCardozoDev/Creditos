import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { RespuestaPaginada } from '../comun/dto/paginacion.dto';
import { DuplicadoException, NoEncontradoException, ReglaNegocioException } from '../comun/errores/excepciones';
import { TipoPersona, TipoUsuario } from '../entidades/enums';
import { Usuario } from '../entidades/usuario.entidad';
import { ConsultarUsuariosDto } from './dto/consultar-usuarios.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { UsuarioRespuestaDto } from './dto/usuario-respuesta.dto';
import { UsuariosRepository } from './usuarios.repository';

/** Roles que solo puede tener una persona natural: son cargos, no empresas. */
const ROLES_DE_PERSONA_NATURAL = [TipoUsuario.ADMIN, TipoUsuario.ANALISTA];

/** Roles que entran al sistema a trabajar. Un ASOCIADO puede existir solo como deudor. */
const ROLES_QUE_OPERAN = [TipoUsuario.ADMIN, TipoUsuario.ANALISTA];

/** Identificacion fija del usuario tecnico que representa al sistema externo del webhook. */
const IDENTIFICACION_SISTEMA = '000000000';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repo: UsuariosRepository,
    private readonly auth: AuthService,
  ) {}

  /**
   * Registra el usuario y, si se pidieron, sus credenciales de acceso, en una sola transaccion.
   * Un usuario que puede entrar y no tiene credencial, o una credencial huerfana, son estados
   * que no deben poder existir: o entran los dos o no entra ninguno.
   */
  async crear(datos: CrearUsuarioDto): Promise<UsuarioRespuestaDto> {
    this.exigirRolCreable(datos.tipoUsuario);
    this.validarPerfil(datos.tipoUsuario, datos.tipoPersona);
    this.validarCredenciales(datos);
    await this.exigirIdentificacionLibre(datos.identificacion);

    const usuario = await this.dataSource.transaction(async (gestor) => {
      const creado = await this.repo.crear(
        {
          identificacion: datos.identificacion,
          nombreRazonSocial: datos.nombreRazonSocial,
          tipoPersona: datos.tipoPersona,
          tipoUsuario: datos.tipoUsuario,
        },
        gestor,
      );
      if (datos.correo && datos.password) {
        await this.auth.crearCredencial(creado.usuarioId, datos.correo, datos.password, gestor);
      }
      return creado;
    });

    return UsuarioRespuestaDto.de(usuario);
  }

  /** Devuelve un usuario por su identificador, o 404 si no existe. */
  async obtenerPorId(usuarioId: string): Promise<UsuarioRespuestaDto> {
    const usuario = await this.repo.buscarPorId(usuarioId);
    if (!usuario) {
      throw new NoEncontradoException('USUARIO_NOT_FOUND', 'El usuario no existe.');
    }
    return UsuarioRespuestaDto.de(usuario);
  }

  /** Devuelve la entidad del usuario, o 404. La usa creditos para resolver al deudor. */
  async exigirEntidadPorId(usuarioId: string, gestor?: EntityManager): Promise<Usuario> {
    const usuario = await this.repo.buscarPorId(usuarioId, gestor);
    if (!usuario) {
      throw new NoEncontradoException('USUARIO_NOT_FOUND', 'El usuario no existe.');
    }
    return usuario;
  }

  /** Devuelve la pagina de usuarios pedida, con el total para calcular las paginas. */
  async listar(consulta: ConsultarUsuariosDto): Promise<RespuestaPaginada<UsuarioRespuestaDto>> {
    const [usuarios, total] = await this.repo.listar(consulta);
    return RespuestaPaginada.de(
      usuarios.map((usuario) => UsuarioRespuestaDto.de(usuario)),
      total,
      consulta.page,
      consulta.limit,
    );
  }

  /** Reutiliza el deudor si ya existe y lo crea si no. Lo llama creditos dentro de su transaccion. */
  async buscarOCrearPorIdentificacion(
    identificacion: string,
    nombreRazonSocial: string,
    tipoPersona: TipoPersona,
    gestor: EntityManager,
  ): Promise<Usuario> {
    const existente = await this.repo.buscarPorIdentificacion(identificacion, gestor);
    if (existente) {
      return existente;
    }
    return this.repo.crear(
      { identificacion, nombreRazonSocial, tipoPersona, tipoUsuario: TipoUsuario.ASOCIADO },
      gestor,
    );
  }

  /**
   * Devuelve el usuario tecnico que "registra" los creditos que llegan por el webhook, con rol
   * ANALISTA para que el filtro de visibilidad por rol no le restrinja lo que acaba de crear.
   * Lo crea la primera vez que hace falta.
   */
  async resolverUsuarioSistema(): Promise<Usuario> {
    const existente = await this.repo.buscarPorIdentificacion(IDENTIFICACION_SISTEMA);
    if (existente) {
      return existente;
    }
    // ponytail: sin proteccion de carrera en la primera llamada concurrente; UQ_Usuarios_Ident
    // la evitaria con un 409 que aqui no se traduce. Aceptable: ocurre a lo sumo una vez.
    return this.repo.crear({
      identificacion: IDENTIFICACION_SISTEMA,
      nombreRazonSocial: 'Sistema externo (webhook)',
      tipoPersona: TipoPersona.PERSONA_NATURAL,
      tipoUsuario: TipoUsuario.ANALISTA,
    });
  }

  /**
   * Exige correo y contrasena juntos, y ambos para quien opera el sistema: un ADMIN o un
   * ANALISTA sin credencial es una cuenta que nadie puede usar.
   */
  private validarCredenciales(datos: CrearUsuarioDto): void {
    const trae = Boolean(datos.correo) === Boolean(datos.password);
    if (!trae) {
      throw new ExcepcionDominio('VALIDATION_ERROR', 'correo y password se envian juntos o no se envia ninguno.');
    }
    if (!datos.correo && ROLES_QUE_OPERAN.includes(datos.tipoUsuario)) {
      throw new ReglaNegocioException(
        `El rol ${datos.tipoUsuario} necesita correo y contrasena para poder entrar al sistema.`,
      );
    }
  }

  /**
   * Rechaza el alta de un ADMIN por la API. El administrador es quien reparte los permisos: si el
   * propio formulario puede fabricar otro, una sesion de administrador comprometida se vuelve
   * permanente. Los administradores salen de la carga inicial, no de una peticion HTTP.
   */
  private exigirRolCreable(tipoUsuario: TipoUsuario): void {
    if (tipoUsuario === TipoUsuario.ADMIN) {
      throw new ReglaNegocioException('Un ADMIN no se crea por la API: se aprovisiona con la carga inicial.');
    }
  }

  /** Un ADMIN o un ANALISTA es una persona; solo el ASOCIADO puede ser una empresa. */
  private validarPerfil(tipoUsuario: TipoUsuario, tipoPersona: TipoPersona): void {
    const esRolDePersona = ROLES_DE_PERSONA_NATURAL.includes(tipoUsuario);
    if (esRolDePersona && tipoPersona !== TipoPersona.PERSONA_NATURAL) {
      throw new ReglaNegocioException(`El rol ${tipoUsuario} solo lo puede tener una persona natural.`);
    }
  }

  /** Rechaza la identificacion si ya la tiene otro usuario, para responder con un mensaje util. */
  private async exigirIdentificacionLibre(identificacion: string): Promise<void> {
    const existente = await this.repo.buscarPorIdentificacion(identificacion);
    if (existente) {
      throw new DuplicadoException('USUARIO_DUPLICADO', 'Ya existe un usuario con esa identificacion.');
    }
  }
}
