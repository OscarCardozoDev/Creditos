import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Min } from 'class-validator';
import { FormaPago, TipoCredito, TipoPersona } from '../../entidades/enums';

/** Datos con los que se registra una solicitud. `estado` no esta aqui a proposito. */
export class CrearCreditoDto {
  @ApiPropertyOptional({
    example: '1001234567',
    description: 'Obligatorio para ANALISTA y ADMIN. Un ASOCIADO no lo envia: se toma de su sesion',
  })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  @Matches(/^[0-9A-Za-z-]+$/, { message: 'identificacionAsociado admite digitos, letras y guiones' })
  identificacionAsociado?: string;

  @ApiPropertyOptional({
    example: 'Juan Perez',
    description: 'Obligatorio para ANALISTA y ADMIN. Un ASOCIADO no lo envia: se toma de su sesion',
  })
  @IsOptional()
  @IsString()
  @Length(3, 150)
  nombreAsociado?: string;

  @ApiPropertyOptional({ enum: TipoPersona, description: 'Solo se usa si el asociado aun no existe' })
  @IsOptional()
  @IsEnum(TipoPersona)
  tipoPersona?: TipoPersona;

  @ApiProperty({ enum: TipoCredito })
  @IsEnum(TipoCredito)
  tipoCredito: TipoCredito;

  @ApiProperty({ example: 15000000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorSolicitado: number;

  @ApiPropertyOptional({ example: 1.5, description: 'Porcentaje mensual. Un ASOCIADO no puede fijarla' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  tasaInteres?: number;

  @ApiProperty({ example: 36 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroCuotas: number;

  @ApiProperty({ enum: FormaPago })
  @IsEnum(FormaPago)
  formaPago: FormaPago;
}
