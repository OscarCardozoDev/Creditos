import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { SistemaAmortizacion, TipoCredito } from '../../entidades/enums';

/** Datos con los que se pide una simulacion. La tasa no se recibe: la pone la politica. */
export class SimularDto {
  @ApiProperty({ enum: TipoCredito })
  @IsEnum(TipoCredito)
  tipoCredito: TipoCredito;

  @ApiProperty({ example: 15000000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  valorSolicitado: number;

  @ApiProperty({ example: 36 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroCuotas: number;

  @ApiPropertyOptional({ example: 1.5, description: 'Porcentaje mensual. Si no viene, se usa la tasa de politica' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tasaInteres?: number;

  @ApiPropertyOptional({ enum: SistemaAmortizacion, description: 'Por defecto, el del producto' })
  @IsOptional()
  @IsEnum(SistemaAmortizacion)
  sistema?: SistemaAmortizacion;
}
