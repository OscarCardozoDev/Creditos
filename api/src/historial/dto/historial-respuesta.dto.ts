import { ApiProperty } from '@nestjs/swagger';
import { EstadoCredito } from '../../entidades/enums';
import { HistorialCredito } from '../../entidades/historial-credito.entidad';

/** Un asiento de la bitacora tal como cruza hacia el cliente: nunca la entidad directamente. */
export class HistorialRespuestaDto {
  @ApiProperty({ enum: EstadoCredito, nullable: true }) estadoAnterior: EstadoCredito | null;
  @ApiProperty({ enum: EstadoCredito }) estadoNuevo: EstadoCredito;
  @ApiProperty({ nullable: true }) usuarioId: string | null;
  @ApiProperty() usuarioNombre: string;
  @ApiProperty({ nullable: true }) observacion: string | null;
  @ApiProperty() fecha: Date;
}

/** Proyecta un asiento de la bitacora al contrato publico. */
export function aHistorialRespuesta(asiento: HistorialCredito): HistorialRespuestaDto {
  return {
    estadoAnterior: asiento.estadoAnterior,
    estadoNuevo: asiento.estadoNuevo,
    usuarioId: asiento.usuarioId,
    usuarioNombre: asiento.usuarioNombre,
    observacion: asiento.observacion,
    fecha: asiento.fecha,
  };
}
