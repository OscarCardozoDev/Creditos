import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { TipoUsuario } from '../entidades/enums';
import { CLAVE_ROLES, PeticionConSesion } from './decoradores';

/** Verifica el rol que declara el endpoint con @Roles(). Controla la ruta, no el recurso. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitidos = this.rolesDeLaRuta(contexto);
    if (permitidos.length === 0) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    if (!peticion.usuario || !permitidos.includes(peticion.usuario.rol)) {
      throw new ExcepcionDominio('SIN_PERMISO', 'El rol de la sesion no alcanza este recurso.');
    }
    return true;
  }

  /** Devuelve los roles declarados en el endpoint, o vacio si no declara ninguno. */
  private rolesDeLaRuta(contexto: ExecutionContext): TipoUsuario[] {
    return (
      this.reflector.getAllAndOverride<TipoUsuario[]>(CLAVE_ROLES, [contexto.getHandler(), contexto.getClass()]) ?? []
    );
  }
}
