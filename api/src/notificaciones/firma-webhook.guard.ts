import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { firmar, firmasIguales } from './firma';

/** Minutos de vigencia de un evento: mas viejo que esto se rechaza aunque la firma sea valida. */
const MINUTOS_VIGENCIA = 5;

/** Peticion con el cuerpo crudo que main.ts guarda antes de parsear el JSON. */
type PeticionConCuerpoCrudo = Request<unknown, unknown, { timestamp?: unknown }> & { rawBody?: Buffer };

/** Autentica el webhook entrante: sin sesion ni cookie, la firma HMAC es su unica credencial. */
@Injectable()
export class FirmaWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionConCuerpoCrudo>();
    this.exigirFirmaValida(peticion);
    this.exigirEventoReciente(peticion.body?.timestamp);
    return true;
  }

  /** Compara la firma recibida contra el HMAC del cuerpo crudo, en tiempo constante. */
  private exigirFirmaValida(peticion: PeticionConCuerpoCrudo): void {
    const secreto = this.config.get<string>('WEBHOOK_SECRET') as string;
    const recibida = peticion.header('X-Signature');
    const cruda = peticion.rawBody?.toString('utf8') ?? '';
    if (!recibida || !firmasIguales(recibida, firmar(cruda, secreto))) {
      throw new ExcepcionDominio('FIRMA_INVALIDA', 'La firma no coincide con el cuerpo recibido.');
    }
  }

  /** Rechaza un evento viejo: con la firma sola alcanzaria para reproducir uno capturado antes. */
  private exigirEventoReciente(timestamp: unknown): void {
    const fecha = new Date(String(timestamp));
    const minutos = Math.abs(Date.now() - fecha.getTime()) / 60_000;
    if (Number.isNaN(fecha.getTime()) || minutos > MINUTOS_VIGENCIA) {
      throw new ExcepcionDominio('FIRMA_INVALIDA', 'El evento no trae una fecha valida o ya vencio.');
    }
  }
}
