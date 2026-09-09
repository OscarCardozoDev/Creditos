import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, UsuarioActual, UsuarioSesion } from '../auth/decoradores';
import { ErrorResponseDto } from '../comun/dto/error-response.dto';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { TipoUsuario } from '../entidades/enums';
import { CreditosService } from './creditos.service';
import { ActualizarCreditoDto } from './dto/actualizar-credito.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ConsultarCreditosDto } from './dto/consultar-creditos.dto';
import { CrearCreditoDto } from './dto/crear-credito.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';

/** Traduce HTTP a llamadas al servicio de creditos. Ninguna regla de negocio vive aqui. */
@ApiTags('creditos')
@ApiCookieAuth()
@ApiResponse({
  status: 401,
  description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
  type: ErrorResponseDto,
})
@Controller('creditos')
export class CreditosController {
  constructor(private readonly creditos: CreditosService) {}

  /** Registra una solicitud y responde 201 con la cabecera Location del recurso creado. */
  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.ANALISTA, TipoUsuario.ASOCIADO)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'CREDITO_DUPLICADO', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'REGLA_NEGOCIO', type: ErrorResponseDto })
  async crear(
    @Body() datos: CrearCreditoDto,
    @UsuarioActual() usuario: UsuarioSesion,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const credito = await this.creditos.crear(datos, usuario);
    respuesta.setHeader('Location', `/api/creditos/${credito.id}`);
    return credito;
  }

  /** Devuelve la pagina de creditos que piden los filtros. Debe declararse antes que ':id'. */
  @Get()
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR: sort no esta en la lista blanca de columnas',
    type: ErrorResponseDto,
  })
  listar(@Query() consulta: ConsultarCreditosDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.creditos.listar(consulta, usuario);
  }

  /** Devuelve los conteos por estado y el total. Debe declararse antes que ':id'. */
  @Get('resumen')
  resumen(@UsuarioActual() usuario: UsuarioSesion) {
    return this.creditos.resumen(usuario);
  }

  /** Devuelve un credito con su cuota mensual y sus transiciones posibles. */
  @Get(':id')
  @ApiResponse({ status: 403, description: 'SIN_PERMISO: el credito es de otro asociado', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  obtener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioSesion) {
    return this.creditos.obtener(id, usuario);
  }

  /** Devuelve la bitacora del credito, de la mas reciente a la mas antigua. */
  @Get(':id/historial')
  @ApiResponse({ status: 403, description: 'SIN_PERMISO: el credito es de otro asociado', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  historial(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioSesion) {
    return this.creditos.historialDe(id, usuario);
  }

  /** Devuelve el plan de amortizacion del credito, ordenado por numero de cuota. */
  @Get(':id/cuotas')
  @ApiResponse({ status: 403, description: 'SIN_PERMISO: el credito es de otro asociado', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  cuotas(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioSesion) {
    return this.creditos.cuotasDe(id, usuario);
  }

  /** Registra el pago de una cuota concreta del plan. Modifica un recurso existente, no crea uno. */
  @Post(':id/cuotas/:numero/pago')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.ANALISTA)
  @HttpCode(200)
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR: fechaPago futura o valorPagado invalido',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND / CUOTA_NOT_FOUND', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'REGLA_NEGOCIO: la cuota ya no esta pendiente', type: ErrorResponseDto })
  pagarCuota(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() datos: RegistrarPagoDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.creditos.pagarCuota(id, numero, datos, usuario);
  }

  /** Modifica las condiciones editables del credito. Exige If-Match con la version leida. */
  @Patch(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.ANALISTA)
  @ApiHeader({ name: 'If-Match', description: 'Version (row_version en base64) leida del credito', required: true })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR: falta If-Match o no es una version valida',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'CONCURRENCIA_CONFLICTO: la version enviada quedo obsoleta',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 422, description: 'CREDITO_INMUTABLE / REGLA_NEGOCIO', type: ErrorResponseDto })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarCreditoDto,
    @Headers('if-match') ifMatch: string | undefined,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.creditos.actualizar(id, datos, this.exigirIfMatch(ifMatch), usuario);
  }

  /** Avanza el estado del credito validando la transicion. */
  @Patch(':id/estado')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.ANALISTA)
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR: falta observacion al rechazar o cancelar',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'CONCURRENCIA_CONFLICTO', type: ErrorResponseDto })
  @ApiResponse({ status: 422, description: 'TRANSICION_INVALIDA', type: ErrorResponseDto })
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CambiarEstadoDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.creditos.cambiarEstado(id, datos, usuario);
  }

  /** Oculta el credito de los listados sin borrar la fila. */
  @Delete(':id')
  @Roles(TipoUsuario.ADMIN)
  @HttpCode(204)
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO: solo ADMIN', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'CREDITO_NOT_FOUND', type: ErrorResponseDto })
  async borrar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioSesion) {
    await this.creditos.borrar(id, usuario);
  }

  /** Exige la cabecera If-Match: sin ella no hay control de concurrencia que valga. */
  private exigirIfMatch(ifMatch: string | undefined): string {
    if (!ifMatch) {
      throw new ExcepcionDominio('VALIDATION_ERROR', 'Falta la cabecera If-Match con la version del credito.');
    }
    return ifMatch;
  }
}
