import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SesionesRepository } from './sesiones.repository';

/** Dias que se conserva una sesion vencida antes de borrarla. */
const DIAS_DE_RETENCION = 30;

/** Borra las sesiones vencidas hace mucho, para que la tabla no crezca sin limite. */
@Injectable()
export class LimpiezaSesionesTarea {
  private readonly registro = new Logger('LimpiezaSesiones');

  constructor(private readonly sesiones: SesionesRepository) {}

  /** Corre una vez al dia y borra lo que ya no sirve ni para auditar. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async limpiar(): Promise<void> {
    const corte = new Date(Date.now() - DIAS_DE_RETENCION * 24 * 3600_000);
    const borradas = await this.sesiones.borrarVencidasAntesDe(corte);
    if (borradas > 0) {
      this.registro.log(`Sesiones vencidas borradas: ${borradas}`);
    }
  }
}
