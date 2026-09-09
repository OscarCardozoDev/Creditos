import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { AuthService } from './auth.service';
import { CLAVE_PUBLICO, PeticionConSesion } from './decoradores';

/** Resuelve la cookie de sesion en cada peticion y publica el usuario en el contexto. */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (this.esRutaPublica(contexto)) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const token = this.leerCookieDeSesion(peticion);
    if (!token) {
      throw new ExcepcionDominio('NO_AUTENTICADO', 'No hay sesion activa.');
    }

    peticion.usuario = await this.auth.resolverSesion(token);
    return true;
  }

  /** Dice si el endpoint se marco con @Publico(). */
  private esRutaPublica(contexto: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [contexto.getHandler(), contexto.getClass()]) ?? false
    );
  }

  /** Devuelve el token de la cookie de sesion, o undefined si no viene. */
  private leerCookieDeSesion(peticion: PeticionConSesion): string | undefined {
    const nombre = this.config.get<string>('SESSION_COOKIE_NAME') as string;
    return peticion.cookies?.[nombre] as string | undefined;
  }
}
