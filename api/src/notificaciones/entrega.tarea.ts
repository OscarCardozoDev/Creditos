import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EntregaService } from './entrega.service';

/** Dispara el barrido de entrega cada WORKER_INTERVALO_MS, sin dejar que un error tumbe la API. */
@Injectable()
export class EntregaTarea implements OnModuleInit {
  private readonly registro = new Logger('EntregaTarea');

  constructor(
    private readonly entrega: EntregaService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /** Registra el intervalo con el periodo de la configuracion: @Interval no admite un valor dinamico. */
  onModuleInit(): void {
    const ms = this.config.get<number>('WORKER_INTERVALO_MS') as number;
    this.scheduler.addInterval(
      'entrega-notificaciones',
      // `void`: ejecutar() ya atrapa todo, y setInterval no espera promesas.
      setInterval(() => void this.ejecutar(), ms),
    );
  }

  /** Corre un barrido y registra el error si algo sale mal, en vez de dejarlo propagarse. */
  private async ejecutar(): Promise<void> {
    try {
      await this.entrega.entregarPendientes();
    } catch (error) {
      this.registro.error('Fallo un barrido de entrega de notificaciones', error as Error);
    }
  }
}
