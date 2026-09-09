import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../comun/dto/error-response.dto';
import { SimularDto } from './dto/simular.dto';
import { SimulacionService } from './simulacion.service';

/** Expone la simulacion de credito. Cualquier usuario autenticado puede usarla, no crea nada. */
@ApiTags('simulacion')
@ApiCookieAuth()
@ApiResponse({
  status: 401,
  description: 'NO_AUTENTICADO / SESION_INVALIDA / SESION_EXPIRADA / SESION_REVOCADA',
  type: ErrorResponseDto,
})
@Controller('simulacion')
export class SimulacionController {
  constructor(private readonly servicio: SimulacionService) {}

  /** Delega el calculo de la simulacion en el servicio y responde 200. */
  @Post()
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'CSRF_INVALIDO', type: ErrorResponseDto })
  @ApiResponse({
    status: 422,
    description: 'REGLA_NEGOCIO: numeroCuotas o tasaInteres fuera de la banda del producto',
    type: ErrorResponseDto,
  })
  simular(@Body() datos: SimularDto) {
    return this.servicio.simular(datos);
  }
}
