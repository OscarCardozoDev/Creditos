import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ExcepcionDominio } from '../errores/excepciones';

export const LIMITE_MAXIMO = 100;

/** Parametros de paginacion y orden comunes a todo listado. */
export class PaginacionDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: LIMITE_MAXIMO, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'campo:asc|desc',
    example: 'fechaSolicitud:desc',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z]+:(asc|desc)$/, {
    message: 'sort debe tener la forma campo:asc o campo:desc',
  })
  sort?: string;
}

export interface MetaPaginacion {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Marca una respuesta de listado para que el interceptor saque meta al nivel superior. */
export class RespuestaPaginada<T> {
  constructor(
    readonly data: T[],
    readonly meta: MetaPaginacion,
  ) {}

  /** Arma la respuesta paginada calculando totalPages a partir del total y el tamano de pagina. */
  static de<T>(data: T[], total: number, page: number, limit: number): RespuestaPaginada<T> {
    return new RespuestaPaginada(data, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    });
  }
}

/** Resuelve sort contra una lista blanca de columnas: un nombre de columna no se puede parametrizar. */
export function resolverOrden(
  sort: string | undefined,
  permitidos: Record<string, string>,
  porDefecto: { columna: string; direccion: 'ASC' | 'DESC' },
): { columna: string; direccion: 'ASC' | 'DESC' } {
  if (!sort) return porDefecto;
  const [campo, direccion] = sort.split(':');
  const columna = permitidos[campo];
  if (!columna) {
    throw new ExcepcionDominio('VALIDATION_ERROR', 'El campo de ordenamiento no esta permitido.', [
      { campo: 'sort', permitidos: Object.keys(permitidos) },
    ]);
  }
  return { columna, direccion: direccion.toUpperCase() as 'ASC' | 'DESC' };
}
