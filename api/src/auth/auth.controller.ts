import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Response } from 'express';
import { ErrorResponseDto } from '../comun/dto/error-response.dto';
import { MotivoRevocacion } from '../entidades/enums';
import { AuthService, SesionCreada } from './auth.service';
import { PeticionConSesion, Publico, UsuarioActual, UsuarioSesion } from './decoradores';
import { LoginDto } from './dto/login.dto';
import { SesionRespuestaDto } from './dto/sesion-respuesta.dto';

/** Cookie que lleva el token de sesion. El navegador impone Secure y Path=/ por el prefijo __Host-. */
const COOKIE_SESION_BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };

/** Cookie del token anti-CSRF: sin HttpOnly, porque el frontend tiene que leerla para copiarla a la cabecera. */
const COOKIE_CSRF = 'csrf-token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Autentica y deja la sesion abierta en las cookies. */
  @Publico()
  @Post('login')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'Correo o contrasena con formato invalido', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'CREDENCIALES_INVALIDAS', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'USUARIO_INACTIVO', type: ErrorResponseDto })
  async login(
    @Body() datos: LoginDto,
    @Req() peticion: PeticionConSesion,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const sesion = await this.auth.iniciarSesion(
      datos.correo,
      datos.password,
      peticion.ip ?? null,
      peticion.header('user-agent') ?? null,
      this.leerCookieDeSesion(peticion),
    );

    this.escribirCookies(respuesta, sesion);
    return { expiraEn: sesion.expiraEn };
  }

  /** Cierra la sesion actual y borra las cookies del navegador. */
  @ApiCookieAuth()
  @Post('logout')
  @HttpCode(204)
  @ApiResponse({
    status: 401,
    description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO', type: ErrorResponseDto })
  async logout(@Req() peticion: PeticionConSesion, @Res({ passthrough: true }) respuesta: Response) {
    const token = this.leerCookieDeSesion(peticion);
    if (token) {
      await this.auth.cerrarSesion(token);
    }
    this.borrarCookies(respuesta);
  }

  /** Devuelve quien es el usuario de la sesion en curso. */
  @ApiCookieAuth()
  @Get('yo')
  @ApiResponse({
    status: 401,
    description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
    type: ErrorResponseDto,
  })
  yo(@UsuarioActual() usuario: UsuarioSesion) {
    return {
      usuarioId: usuario.usuarioId,
      nombre: usuario.nombre,
      rol: usuario.rol,
      tipoPersona: usuario.tipoPersona,
    };
  }

  /** Lista las sesiones vivas del usuario, marcando cual es la actual. */
  @ApiCookieAuth()
  @Get('sesiones')
  @ApiResponse({
    status: 401,
    description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
    type: ErrorResponseDto,
  })
  async sesiones(@UsuarioActual() usuario: UsuarioSesion) {
    const sesiones = await this.auth.listarSesiones(usuario.usuarioId);
    return sesiones.map((sesion) => SesionRespuestaDto.de(sesion, usuario.tokenHash));
  }

  /** Cierra una sesion concreta del propio usuario. */
  @ApiCookieAuth()
  @Delete('sesiones/:id')
  @HttpCode(204)
  @ApiResponse({
    status: 401,
    description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO', type: ErrorResponseDto })
  async cerrarUna(@Param('id') id: string, @UsuarioActual() usuario: UsuarioSesion) {
    const sesiones = await this.auth.listarSesiones(usuario.usuarioId);
    const esSuya = sesiones.some((sesion) => sesion.tokenHash === id);
    if (esSuya) {
      await this.auth.revocarSesion(id, MotivoRevocacion.CIERRE_SESION);
    }
  }

  /** Escribe la cookie de sesion y la del token anti-CSRF. */
  private escribirCookies(respuesta: Response, sesion: SesionCreada): void {
    const maxAge = sesion.expiraEn.getTime() - Date.now();
    respuesta.cookie(this.nombreCookieSesion(), sesion.token, { ...COOKIE_SESION_BASE, maxAge });
    respuesta.cookie(COOKIE_CSRF, sesion.csrfToken, { ...COOKIE_SESION_BASE, httpOnly: false, maxAge });
  }

  /** Borra ambas cookies al cerrar la sesion. */
  private borrarCookies(respuesta: Response): void {
    respuesta.clearCookie(this.nombreCookieSesion(), COOKIE_SESION_BASE);
    respuesta.clearCookie(COOKIE_CSRF, { ...COOKIE_SESION_BASE, httpOnly: false });
  }

  /** Devuelve el token de sesion que trae la peticion, o undefined si no trae. */
  private leerCookieDeSesion(peticion: PeticionConSesion): string | undefined {
    return peticion.cookies?.[this.nombreCookieSesion()] as string | undefined;
  }

  /** Nombre de la cookie de sesion, tomado de la configuracion. */
  private nombreCookieSesion(): string {
    return this.config.get<string>('SESSION_COOKIE_NAME') as string;
  }
}
