import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Roles } from '../auth/decoradores';
import { ErrorResponseDto } from '../comun/dto/error-response.dto';
import { MotivoRevocacion, TipoUsuario } from '../entidades/enums';
import { ConsultarUsuariosDto } from './dto/consultar-usuarios.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@ApiCookieAuth()
@ApiResponse({
  status: 401,
  description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
  type: ErrorResponseDto,
})
@ApiResponse({ status: 403, description: 'SIN_PERMISO: solo ADMIN o ANALISTA', type: ErrorResponseDto })
@Controller('usuarios')
@Roles(TipoUsuario.ADMIN, TipoUsuario.ANALISTA)
export class UsuariosController {
  constructor(
    private readonly servicio: UsuariosService,
    private readonly auth: AuthService,
  ) {}

  /** Registra un usuario y responde 201 con sus datos publicos. */
  @Post()
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'USUARIO_DUPLICADO', type: ErrorResponseDto })
  @ApiResponse({
    status: 422,
    description: 'REGLA_NEGOCIO: rol de persona con tipoPersona incompatible',
    type: ErrorResponseDto,
  })
  crear(@Body() datos: CrearUsuarioDto) {
    return this.servicio.crear(datos);
  }

  /** Devuelve la pagina de usuarios que piden los filtros. */
  @Get()
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR: sort no esta en la lista blanca de columnas',
    type: ErrorResponseDto,
  })
  listar(@Query() consulta: ConsultarUsuariosDto) {
    return this.servicio.listar(consulta);
  }

  /** Devuelve un usuario por su identificador. */
  @Get(':id')
  @ApiResponse({ status: 404, description: 'USUARIO_NOT_FOUND', type: ErrorResponseDto })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtenerPorId(id);
  }

  /** Cierra todas las sesiones de un usuario. Solo un ADMIN puede echar a otro del sistema. */
  @Delete(':id/sesiones')
  @Roles(TipoUsuario.ADMIN)
  @HttpCode(204)
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO / SIN_PERMISO: solo ADMIN', type: ErrorResponseDto })
  async cerrarSesiones(@Param('id', ParseUUIDPipe) id: string) {
    await this.auth.revocarSesionesDe(id, MotivoRevocacion.REVOCACION_ADMIN);
  }
}
