import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { TipoPersona, TipoUsuario } from '../entidades/enums';

export const CLAVE_PUBLICO = 'ruta_publica';
export const CLAVE_ROLES = 'roles_permitidos';

/** Exime a la ruta del guard de sesion, que por lo demas se aplica a toda la API. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Declara los roles que pueden alcanzar la ruta. */
export const Roles = (...roles: TipoUsuario[]) => SetMetadata(CLAVE_ROLES, roles);

/** Usuario de la sesion en curso, publicado por el guard de sesion. */
export interface UsuarioSesion {
  usuarioId: string;
  rol: TipoUsuario;
  nombre: string;
  /** Perfil del deudor. Decide que productos puede tomar cuando pide para si mismo. */
  tipoPersona: TipoPersona;
  tokenHash: string;
  csrfToken: string;
}

/** Peticion con el usuario ya resuelto por el guard de sesion. */
export type PeticionConSesion = Request & { usuario: UsuarioSesion };

/** Inyecta el usuario de la sesion en un parametro del controlador. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioSesion => {
  return contexto.switchToHttp().getRequest<PeticionConSesion>().usuario;
});
