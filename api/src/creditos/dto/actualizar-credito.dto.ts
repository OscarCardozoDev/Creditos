import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { FormaPago } from '../../entidades/enums';

/** Lo unico editable de un credito, y solo mientras siga en SOLICITADO o EN_ESTUDIO. */
export class ActualizarCreditoDto {
  @ApiPropertyOptional({ example: 12000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorSolicitado?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  tasaInteres?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroCuotas?: number;

  @ApiPropertyOptional({ enum: FormaPago })
  @IsOptional()
  @IsEnum(FormaPago)
  formaPago?: FormaPago;
}
