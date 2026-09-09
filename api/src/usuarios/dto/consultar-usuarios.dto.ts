import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PaginacionDto } from '../../comun/dto/paginacion.dto';
import { TipoPersona, TipoUsuario } from '../../entidades/enums';

/** Filtros del listado de usuarios, sobre la paginacion comun. */
export class ConsultarUsuariosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: TipoUsuario })
  @IsOptional()
  @IsEnum(TipoUsuario)
  tipoUsuario?: TipoUsuario;

  @ApiPropertyOptional({ enum: TipoPersona })
  @IsOptional()
  @IsEnum(TipoPersona)
  tipoPersona?: TipoPersona;

  @ApiPropertyOptional({ description: 'Busca por identificacion o nombre' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  q?: string;
}
