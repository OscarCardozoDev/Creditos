import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PaginacionDto } from '../../comun/dto/paginacion.dto';
import { EstadoCredito, TipoCredito } from '../../entidades/enums';

/** Filtros del listado de creditos, sobre la paginacion comun. */
export class ConsultarCreditosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: EstadoCredito })
  @IsOptional()
  @IsEnum(EstadoCredito)
  estado?: EstadoCredito;

  @ApiPropertyOptional({ enum: TipoCredito })
  @IsOptional()
  @IsEnum(TipoCredito)
  tipoCredito?: TipoCredito;

  @ApiPropertyOptional({ example: '1001234567' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  identificacion?: string;

  @ApiPropertyOptional({ description: 'Inicio del rango sobre fecha_solicitud' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ description: 'Fin del rango sobre fecha_solicitud' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ description: 'Busca por numero de credito o nombre del asociado' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  q?: string;
}
