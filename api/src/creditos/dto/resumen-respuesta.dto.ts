import { ApiProperty } from '@nestjs/swagger';
import { EstadoCredito } from '../../entidades/enums';

/** Cuenta de creditos vivos en un estado, para una tarjeta del tablero. */
export class ResumenPorEstadoDto {
  @ApiProperty({ enum: EstadoCredito }) estado: EstadoCredito;
  @ApiProperty() total: number;
}

/** Conteos y montos del tablero: todo resuelto en SQL, sin traer filas al cliente para sumarlas. */
export class ResumenRespuestaDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: [ResumenPorEstadoDto] }) porEstado: ResumenPorEstadoDto[];
  @ApiProperty() montoTotalSolicitado: string;
  // DESEMBOLSADO fue APROBADO antes: excluirlo haria bajar el monto cuando el credito avanza de estado.
  @ApiProperty() montoAprobado: string;
}
