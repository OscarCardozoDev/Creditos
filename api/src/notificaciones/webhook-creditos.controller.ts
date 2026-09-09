import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Publico, UsuarioSesion } from '../auth/decoradores';
import { ErrorResponseDto } from '../comun/dto/error-response.dto';
import { CreditosService } from '../creditos/creditos.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { WebhookCreditoDto } from './dto/webhook-credito.dto';
import { FirmaWebhookGuard } from './firma-webhook.guard';
import { NotificacionesRepository } from './notificaciones.repository';

/**
 * Receptor del webhook de creditos: adaptador de transporte puro. Verifica firma y frescura
 * (FirmaWebhookGuard), descarta duplicados por eventId y delega en CreditosService.crear().
 * Cero regla de negocio propia: la unica logica de creacion de un credito vive en creditos/.
 */
@ApiTags('webhooks')
@Controller('webhooks/creditos')
export class WebhookCreditosController {
  constructor(
    private readonly creditos: CreditosService,
    private readonly usuarios: UsuariosService,
    private readonly repo: NotificacionesRepository,
  ) {}

  /** Recibe un evento externo de alta de credito y responde rapido, sin reprocesar un reintento. */
  @Post()
  @Publico()
  @UseGuards(FirmaWebhookGuard)
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', type: ErrorResponseDto })
  @ApiResponse({
    status: 401,
    description: 'FIRMA_INVALIDA: firma ausente, invalida o evento vencido',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 422, description: 'REGLA_NEGOCIO', type: ErrorResponseDto })
  async recibir(@Body() cuerpo: WebhookCreditoDto): Promise<{ procesado: boolean }> {
    const esNuevo = await this.repo.intentarMarcarRecibido(cuerpo.eventId);
    if (!esNuevo) {
      return { procesado: false };
    }
    try {
      await this.creditos.crear(cuerpo.data, await this.solicitanteSistema());
    } catch (error) {
      // Si crear() fallo, el evento no quedo procesado de verdad: un reintento legitimo
      // del emisor debe poder intentarlo de nuevo en vez de recibir "ya procesado" para siempre.
      await this.repo.liberarMarcaRecibido(cuerpo.eventId);
      throw error;
    }
    return { procesado: true };
  }

  /** Arma la sesion sintetica con la que el webhook "actua" como si fuera un usuario ANALISTA. */
  private async solicitanteSistema(): Promise<UsuarioSesion> {
    const usuario = await this.usuarios.resolverUsuarioSistema();
    return {
      usuarioId: usuario.usuarioId,
      rol: usuario.tipoUsuario,
      nombre: usuario.nombreRazonSocial,
      tipoPersona: usuario.tipoPersona,
      tokenHash: '',
      csrfToken: '',
    };
  }
}
