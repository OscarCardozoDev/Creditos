import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsUUID, ValidateNested } from 'class-validator';
import { CrearCreditoDto } from '../../creditos/dto/crear-credito.dto';

/** Cuerpo que manda el sistema externo para registrar un credito por el receptor del webhook. */
export class WebhookCreditoDto {
  /** Clave de idempotencia del evento: un reintento del emisor trae el mismo valor. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId: string;

  /** Momento en que el emisor genero el evento; se rechaza si tiene mas de 5 minutos. */
  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' })
  @IsISO8601()
  timestamp: string;

  /** Datos del credito, con la misma forma que exige el alta normal. */
  @ApiProperty({ type: CrearCreditoDto })
  @ValidateNested()
  @Type(() => CrearCreditoDto)
  data: CrearCreditoDto;
}
