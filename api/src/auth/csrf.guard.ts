import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { CLAVE_PUBLICO, PeticionConSesion } from './decoradores';

/** Metodos de solo lectura: no cambian estado, asi que no exigen el token anti-CSRF. */
const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

/** Exige que la cabecera X-CSRF-Token coincida con el valor asociado a la sesion. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (this.esRutaPublica(contexto)) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    if (METODOS_SEGUROS.includes(peticion.method)) {
      return true;
    }

    const enviado = peticion.header('X-CSRF-Token');
    if (!enviado || !this.sonIguales(enviado, peticion.usuario.csrfToken)) {
      throw new ExcepcionDominio('CSRF_INVALIDO', 'Falta la cabecera X-CSRF-Token o no coincide con la sesion.');
    }
    return true;
  }

  /** Dice si el endpoint se marco con @Publico(). */
  private esRutaPublica(contexto: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [contexto.getHandler(), contexto.getClass()]) ?? false
    );
  }

  /** Compara los dos tokens en tiempo constante: la igualdad simple filtra informacion por el tiempo. */
  private sonIguales(enviado: string, esperado: string): boolean {
    const a = Buffer.from(enviado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
