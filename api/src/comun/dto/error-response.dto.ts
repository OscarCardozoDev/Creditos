import { ApiProperty } from '@nestjs/swagger';
import { CodigoError } from '../errores/codigos-error';

/** Cuerpo del error tal como lo arma el filtro global. Solo para que Swagger documente el contrato. */
export class ErrorDetalleDto {
  @ApiProperty({ example: 'CREDITO_NOT_FOUND', description: 'Codigo estable del catalogo de errores' })
  code: CodigoError;

  @ApiProperty({ example: 'El credito no existe' })
  message: string;

  @ApiProperty({ type: [Object], example: [] })
  details: unknown[];

  @ApiProperty({ example: '01J8XQ4M7Z9K2N' })
  requestId: string;
}

/** Forma de toda respuesta de error de la API, sin excepcion. Nunca la arma un controlador. */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ErrorDetalleDto })
  error: ErrorDetalleDto;
}
