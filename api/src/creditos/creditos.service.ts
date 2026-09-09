import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../auth/decoradores';
import { RespuestaPaginada } from '../comun/dto/paginacion.dto';
import {
  ConcurrenciaException,
  DuplicadoException,
  ExcepcionDominio,
  NoEncontradoException,
  TransicionInvalidaException,
} from '../comun/errores/excepciones';
import { Credito } from '../entidades/credito.entidad';
import { Usuario } from '../entidades/usuario.entidad';
import { Cuota } from '../entidades/cuota.entidad';
import { EstadoCredito, EstadoCuota, TipoPersona, TipoUsuario } from '../entidades/enums';
import { HistorialRepository } from '../historial/historial.repository';
import { eventoCreditoCreado, eventoEstadoCambiado } from '../notificaciones/eventos';
import { NotificacionesRepository } from '../notificaciones/notificaciones.repository';
import { SimulacionService } from '../simulacion/simulacion.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { CreditosRepository, Solicitante } from './creditos.repository';
import { ActualizarCreditoDto } from './dto/actualizar-credito.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ConsultarCreditosDto } from './dto/consultar-creditos.dto';
import { aCreditoRespuesta, CreditoRespuestaDto } from './dto/credito-respuesta.dto';
import { aCuotaRespuesta, CuotaRespuestaDto } from './dto/cuota-respuesta.dto';
import { CrearCreditoDto } from './dto/crear-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { ResumenRespuestaDto } from './dto/resumen-respuesta.dto';
import { CuotasRepository } from './cuotas.repository';
import { aFechaISO, sumarMeses } from './fechas-cuotas';
import {
  destinosPermitidos,
  ESTADOS_EDITABLES,
  ESTADOS_QUE_EXIGEN_OBSERVACION,
  esTransicionValida,
} from './maquina-estados';
import { exigirFormaDePagoCompatible, exigirPerfilCompatible } from './reglas-producto';
import { aHistorialRespuesta, HistorialRespuestaDto } from '../historial/dto/historial-respuesta.dto';

/** Ciclo de vida de la solicitud de credito, su plan de cuotas y sus pagos. */
@Injectable()
export class CreditosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repo: CreditosRepository,
    private readonly historial: HistorialRepository,
    private readonly notificaciones: NotificacionesRepository,
    private readonly usuarios: UsuariosService,
    private readonly simulacion: SimulacionService,
    private readonly cuotas: CuotasRepository,
  ) {}

  /** Registra el credito, su primera fila de historial y su notificacion, en una sola transaccion. */
  async crear(datos: CrearCreditoDto, solicitante: UsuarioSesion): Promise<CreditoRespuestaDto> {
    const credito = await this.dataSource.transaction(async (gestor) => {
      const deudor = await this.resolverDeudor(datos, solicitante, gestor);

      exigirPerfilCompatible(datos.tipoCredito, deudor.tipoPersona);
      exigirFormaDePagoCompatible(datos.tipoCredito, datos.formaPago);
      this.simulacion.exigirPlazoDentroDelProducto(datos.tipoCredito, datos.numeroCuotas);

      const valorSolicitado = new Decimal(datos.valorSolicitado).toFixed(2);
      await this.exigirSinDuplicado(deudor.usuarioId, datos, valorSolicitado, gestor);

      const nuevo = await this.repo.crear(
        {
          numCredito: await this.repo.siguienteNumeroCredito(gestor),
          deudorId: deudor.usuarioId,
          tipoCredito: datos.tipoCredito,
          valorSolicitado,
          tasaInteres: this.resolverTasa(datos, solicitante).toFixed(6),
          numCuotas: datos.numeroCuotas,
          formaPago: datos.formaPago,
          estado: EstadoCredito.SOLICITADO,
        },
        gestor,
      );
      nuevo.deudor = deudor;

      await this.historial.registrar(
        {
          creditoId: nuevo.creditoId,
          estadoAnterior: null,
          estadoNuevo: EstadoCredito.SOLICITADO,
          usuarioId: solicitante.usuarioId,
          usuarioNombre: solicitante.nombre,
          observacion: 'Solicitud registrada.',
        },
        gestor,
      );

      await this.notificaciones.encolar(nuevo.creditoId, eventoCreditoCreado(nuevo, deudor.identificacion), gestor);

      return nuevo;
    });

    return this.proyectar(await this.exigirCredito(credito.creditoId, solicitante));
  }

  /** Devuelve un credito con su cuota mensual, sus dias promedio de pago y sus transiciones. */
  async obtener(creditoId: string, solicitante: UsuarioSesion): Promise<CreditoRespuestaDto> {
    return this.proyectar(await this.exigirCredito(creditoId, solicitante));
  }

  /** Devuelve la pagina de creditos que piden los filtros, ya recortada por el rol de quien pide. */
  async listar(
    consulta: ConsultarCreditosDto,
    solicitante: UsuarioSesion,
  ): Promise<RespuestaPaginada<CreditoRespuestaDto>> {
    const [creditos, total] = await this.repo.listar(consulta, this.aSolicitante(solicitante));
    const proyectados = await Promise.all(creditos.map((credito) => this.proyectar(credito)));
    return RespuestaPaginada.de(proyectados, total, consulta.page, consulta.limit);
  }

  /** Cuenta los creditos vivos por estado y suma el valor solicitado total y el aprobado, para el tablero. */
  async resumen(solicitante: UsuarioSesion): Promise<ResumenRespuestaDto> {
    const porEstado = await this.repo.contarPorEstado(this.aSolicitante(solicitante));
    const total = porEstado.reduce((suma, fila) => suma + fila.total, 0);
    const montoTotalSolicitado = this.sumarMontos(porEstado);
    // DESEMBOLSADO fue APROBADO antes: excluirlo haria bajar el monto cuando el credito avanza de estado.
    const montoAprobado = this.sumarMontos(
      porEstado.filter((fila) => fila.estado === EstadoCredito.APROBADO || fila.estado === EstadoCredito.DESEMBOLSADO),
    );
    return {
      total,
      porEstado: porEstado.map((fila) => ({ estado: fila.estado, total: fila.total })),
      montoTotalSolicitado,
      montoAprobado,
    };
  }

  /** Suma el valor solicitado de un grupo de filas del resumen, con decimal.js. */
  private sumarMontos(filas: { montoSolicitado: string }[]): string {
    return filas.reduce((suma, fila) => suma.plus(fila.montoSolicitado), new Decimal(0)).toFixed(2);
  }

  /** Modifica las condiciones financieras si el credito sigue editable y nadie lo cambio antes. */
  async actualizar(
    creditoId: string,
    datos: ActualizarCreditoDto,
    versionEsperada: string,
    solicitante: UsuarioSesion,
  ): Promise<CreditoRespuestaDto> {
    const credito = await this.exigirCredito(creditoId, solicitante);
    this.exigirEditable(credito);

    const cambios = this.armarCambios(credito, datos);
    const escrito = await this.dataSource.transaction((gestor) =>
      this.repo.actualizarSiVersionCoincide(creditoId, this.aVersion(versionEsperada), cambios, gestor),
    );
    if (!escrito) {
      throw new ConcurrenciaException();
    }

    return this.proyectar(await this.exigirCredito(creditoId, solicitante));
  }

  /**
   * Avanza el estado y escribe su fila de historial y su notificacion, en la misma transaccion.
   * Usa el `rowVersion` que acaba de leer como condicion del UPDATE: no exige `If-Match` porque
   * el contrato de este endpoint no lo pide, pero la escritura sigue siendo optimista.
   */
  async cambiarEstado(
    creditoId: string,
    datos: CambiarEstadoDto,
    solicitante: UsuarioSesion,
  ): Promise<CreditoRespuestaDto> {
    const credito = await this.exigirCredito(creditoId, solicitante);
    this.exigirTransicionPermitida(credito.estado, datos.estado);
    this.exigirObservacionSiHaceFalta(datos);

    await this.dataSource.transaction(async (gestor) => {
      const escrito = await this.repo.actualizarSiVersionCoincide(
        creditoId,
        credito.rowVersion,
        { estado: datos.estado },
        gestor,
      );
      if (!escrito) {
        throw new ConcurrenciaException();
      }

      await this.historial.registrar(
        {
          creditoId,
          estadoAnterior: credito.estado,
          estadoNuevo: datos.estado,
          usuarioId: solicitante.usuarioId,
          usuarioNombre: solicitante.nombre,
          observacion: datos.observacion ?? null,
        },
        gestor,
      );

      await this.notificaciones.encolar(
        creditoId,
        eventoEstadoCambiado(credito, credito.deudor.identificacion, credito.estado, datos.estado),
        gestor,
      );

      if (datos.estado === EstadoCredito.APROBADO) {
        await this.generarPlanDeCuotas(credito, gestor);
      }
      if (credito.estado === EstadoCredito.APROBADO && datos.estado === EstadoCredito.CANCELADO) {
        await this.cuotas.anularPendientes(creditoId, gestor);
      }
    });

    return this.proyectar(await this.exigirCredito(creditoId, solicitante));
  }

  /** Devuelve el plan de cuotas del credito, ordenado por numero, si quien pide puede verlo. */
  async cuotasDe(creditoId: string, solicitante: UsuarioSesion): Promise<CuotaRespuestaDto[]> {
    await this.exigirCredito(creditoId, solicitante);
    const plan = await this.cuotas.listarPorCredito(creditoId);
    return plan.map(aCuotaRespuesta);
  }

  /** Registra el pago de una cuota pendiente y la deja PAGADA con su fecha y su valor. */
  async pagarCuota(
    creditoId: string,
    numeroCuota: number,
    datos: RegistrarPagoDto,
    solicitante: UsuarioSesion,
  ): Promise<CuotaRespuestaDto> {
    await this.exigirCredito(creditoId, solicitante);
    const cuota = await this.cuotas.buscarPorNumero(creditoId, numeroCuota);
    if (!cuota) {
      throw new NoEncontradoException('CUOTA_NOT_FOUND', 'La cuota no existe.');
    }
    this.exigirCuotaPendiente(cuota);

    await this.cuotas.registrarPago(cuota.cuotaId, datos.fechaPago, datos.valorPagado, this.dataSource.manager);

    const actualizada = await this.cuotas.buscarPorNumero(creditoId, numeroCuota);
    return aCuotaRespuesta(actualizada!);
  }

  /**
   * Genera las N filas del plan de amortizacion al aprobar el credito, dentro de su transaccion.
   * El primer vencimiento cae un mes despues de la aprobacion; los siguientes, mes a mes.
   */
  private async generarPlanDeCuotas(credito: Credito, gestor: EntityManager): Promise<void> {
    const plan = this.simulacion.planDePagos(
      credito.tipoCredito,
      credito.valorSolicitado,
      credito.tasaInteres,
      credito.numCuotas,
    );
    const aprobacion = new Date();

    const filas: Partial<Cuota>[] = plan.map((fila) => ({
      creditoId: credito.creditoId,
      numeroCuota: fila.numeroCuota,
      fechaVencimiento: aFechaISO(sumarMeses(aprobacion, fila.numeroCuota)),
      valorCuota: fila.valorCuota,
      abonoCapital: fila.abonoCapital,
      abonoInteres: fila.abonoInteres,
      saldoPosterior: fila.saldoPosterior,
    }));

    await this.cuotas.crearPlan(filas, gestor);
  }

  /** Rechaza el pago de una cuota que ya no esta pendiente: pagada o anulada no se vuelven a tocar. */
  private exigirCuotaPendiente(cuota: Cuota): void {
    if (cuota.estado !== EstadoCuota.PENDIENTE) {
      throw new ExcepcionDominio('REGLA_NEGOCIO', `La cuota ${cuota.numeroCuota} ya no esta pendiente.`);
    }
  }

  /** Oculta el credito de los listados sin borrar la fila. */
  async borrar(creditoId: string, solicitante: UsuarioSesion): Promise<void> {
    await this.exigirCredito(creditoId, solicitante);
    await this.repo.borradoLogico(creditoId);
  }

  /** Devuelve la bitacora del credito si quien pide puede verlo. */
  async historialDe(creditoId: string, solicitante: UsuarioSesion): Promise<HistorialRespuestaDto[]> {
    await this.exigirCredito(creditoId, solicitante);
    const asientos = await this.historial.listarDeCredito(creditoId);
    return asientos.map(aHistorialRespuesta);
  }

  /** Devuelve el credito que quien pide puede ver, o el 403 o el 404 que corresponda. */
  async exigirCredito(creditoId: string, solicitante: UsuarioSesion): Promise<Credito> {
    const credito = await this.repo.buscarPorId(creditoId, this.aSolicitante(solicitante));
    if (credito) {
      return credito;
    }
    await this.distinguirAjenoDeInexistente(creditoId);
    throw new NoEncontradoException('CREDITO_NOT_FOUND', 'El credito no existe.');
  }

  /**
   * Si el credito existe pero el filtro del rol lo escondio, responde 403 y no 404: quien pide
   * esta identificado y el recurso no le corresponde, que es la distincion que pide el catalogo.
   */
  private async distinguirAjenoDeInexistente(creditoId: string): Promise<void> {
    if (await this.repo.existeParaCualquiera(creditoId)) {
      throw new ExcepcionDominio('SIN_PERMISO', 'El credito pertenece a otro asociado.');
    }
  }

  /** Proyecta el credito al contrato publico, con lo que se calcula al vuelo. */
  private async proyectar(credito: Credito): Promise<CreditoRespuestaDto> {
    return aCreditoRespuesta(credito, {
      cuotaMensual: this.cuotaMensualDe(credito),
      diasPromedioPago: await this.cuotas.diasPromedioPago(credito.creditoId),
      transicionesPermitidas: destinosPermitidos(credito.estado),
    });
  }

  /** Calcula la cuota del credito al vuelo: es un derivado, no se persiste. */
  private cuotaMensualDe(credito: Credito): string {
    const plan = this.simulacion.planDePagos(
      credito.tipoCredito,
      credito.valorSolicitado,
      credito.tasaInteres,
      credito.numCuotas,
    );
    return plan[0].valorCuota;
  }

  /**
   * Devuelve el deudor del credito. Un ASOCIADO solo puede pedir para si mismo, asi que los datos
   * del asociado que traiga el cuerpo se ignoran, igual que se ignora la tasa que proponga.
   * La comprobacion va aqui y no despues del commit: descubrirlo al releer dejaba el credito ya
   * escrito y respondia 403 sobre un dato que si existia.
   */
  private async resolverDeudor(
    datos: CrearCreditoDto,
    solicitante: UsuarioSesion,
    gestor: EntityManager,
  ): Promise<Usuario> {
    if (solicitante.rol === TipoUsuario.ASOCIADO) {
      return this.usuarios.exigirEntidadPorId(solicitante.usuarioId, gestor);
    }
    if (!datos.identificacionAsociado || !datos.nombreAsociado) {
      throw new ExcepcionDominio(
        'VALIDATION_ERROR',
        'identificacionAsociado y nombreAsociado son obligatorios para ANALISTA y ADMIN.',
      );
    }
    return this.usuarios.buscarOCrearPorIdentificacion(
      datos.identificacionAsociado,
      datos.nombreAsociado,
      datos.tipoPersona ?? TipoPersona.PERSONA_NATURAL,
      gestor,
    );
  }

  /** Un ASOCIADO no fija el precio del dinero: se le impone la tasa de politica. */
  private resolverTasa(datos: CrearCreditoDto, solicitante: UsuarioSesion): Decimal {
    if (solicitante.rol === TipoUsuario.ASOCIADO || datos.tasaInteres === undefined) {
      return this.simulacion.tasaDePolitica(datos.tipoCredito);
    }
    this.simulacion.exigirTasaEnBanda(datos.tipoCredito, datos.tasaInteres);
    return new Decimal(datos.tasaInteres);
  }

  /**
   * Rechaza la solicitud si ya hay otra viva equivalente. El indice unico filtrado cierra la
   * ventana entre esta comprobacion y el INSERT; esto existe para poder dar un mensaje util.
   */
  private async exigirSinDuplicado(
    deudorId: string,
    datos: CrearCreditoDto,
    valorSolicitado: string,
    gestor: EntityManager,
  ): Promise<void> {
    const duplicado = await this.repo.existeDuplicado(deudorId, datos.tipoCredito, valorSolicitado, gestor);
    if (duplicado) {
      throw new DuplicadoException(
        'CREDITO_DUPLICADO',
        'Ya existe una solicitud en tramite del mismo tipo y valor para este asociado.',
      );
    }
  }

  /** Rechaza la edicion de un credito que ya salio de los estados editables. */
  private exigirEditable(credito: Credito): void {
    if (!ESTADOS_EDITABLES.includes(credito.estado)) {
      throw new ExcepcionDominio(
        'CREDITO_INMUTABLE',
        `Un credito en ${credito.estado} ya no admite cambios en sus condiciones.`,
      );
    }
  }

  /** Rechaza un salto que la maquina de estados no contempla, diciendo cuales si valian. */
  private exigirTransicionPermitida(desde: EstadoCredito, hasta: EstadoCredito): void {
    if (!esTransicionValida(desde, hasta)) {
      const posibles = destinosPermitidos(desde);
      const detalle = posibles.length ? posibles.join(', ') : 'ninguno, es un estado terminal';
      throw new TransicionInvalidaException(`No se puede pasar de ${desde} a ${hasta}. Destinos posibles: ${detalle}.`);
    }
  }

  /** Exige el motivo al rechazar o cancelar: sin el, la bitacora no puede responder por que. */
  private exigirObservacionSiHaceFalta(datos: CambiarEstadoDto): void {
    const hacefalta = ESTADOS_QUE_EXIGEN_OBSERVACION.includes(datos.estado);
    if (hacefalta && !datos.observacion) {
      throw new ExcepcionDominio('VALIDATION_ERROR', `Pasar a ${datos.estado} exige una observacion.`, [
        { campo: 'observacion', error: 'obligatoria al rechazar o cancelar' },
      ]);
    }
  }

  /** Traduce el DTO de edicion a las columnas que se van a escribir, validando la tasa si viene. */
  private armarCambios(credito: Credito, datos: ActualizarCreditoDto): Record<string, unknown> {
    const cambios: Record<string, unknown> = {};

    if (datos.valorSolicitado !== undefined) {
      cambios.valorSolicitado = new Decimal(datos.valorSolicitado).toFixed(2);
    }
    if (datos.numeroCuotas !== undefined) {
      this.simulacion.exigirPlazoDentroDelProducto(credito.tipoCredito, datos.numeroCuotas);
      cambios.numCuotas = datos.numeroCuotas;
    }
    if (datos.formaPago !== undefined) {
      exigirFormaDePagoCompatible(credito.tipoCredito, datos.formaPago);
      cambios.formaPago = datos.formaPago;
    }
    if (datos.tasaInteres !== undefined) {
      this.simulacion.exigirTasaEnBanda(credito.tipoCredito, datos.tasaInteres);
      cambios.tasaInteres = new Decimal(datos.tasaInteres).toFixed(6);
    }
    return cambios;
  }

  /** Convierte el If-Match que envio el cliente en el ROWVERSION con el que se compara. */
  private aVersion(versionEsperada: string): Buffer {
    const limpia = versionEsperada.replace(/^"|"$/g, '');
    const version = Buffer.from(limpia, 'base64');
    if (version.length !== 8) {
      throw new ExcepcionDominio('VALIDATION_ERROR', 'La cabecera If-Match no trae una version valida.');
    }
    return version;
  }

  /** Reduce el usuario de la sesion a lo que el repositorio necesita para filtrar. */
  private aSolicitante(usuario: UsuarioSesion): Solicitante {
    return { usuarioId: usuario.usuarioId, rol: usuario.rol };
  }
}
