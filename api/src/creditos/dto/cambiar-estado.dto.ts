import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { EstadoCredito } from '../../entidades/enums';

/** Cambio de estado. Es el unico sitio por donde `estado` entra al sistema. */
export class CambiarEstadoDto {
  @ApiProperty({ enum: EstadoCredito })
  @IsEnum(EstadoCredito)
  estado: EstadoCredito;

  @ApiPropertyOptional({ description: 'Obligatoria al rechazar o cancelar' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  observacion?: string;
}
