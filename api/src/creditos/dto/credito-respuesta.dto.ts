import { ApiProperty } from '@nestjs/swagger';
import Decimal from 'decimal.js';
import { Credito } from '../../entidades/credito.entidad';
import { EstadoCredito, FormaPago, TipoCredito } from '../../entidades/enums';

/** Lo que del credito cruza al cliente. Los datos del asociado se devuelven aplanados. */
export class CreditoRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() numeroCredito: string;
  @ApiProperty() identificacionAsociado: string;
  @ApiProperty() nombreAsociado: string;
  @ApiProperty({ enum: TipoCredito }) tipoCredito: TipoCredito;
  @ApiProperty() valorSolicitado: string;
  @ApiProperty() tasaInteres: string;
  @ApiProperty() numeroCuotas: number;
  @ApiProperty({ enum: FormaPago }) formaPago: FormaPago;
  @ApiProperty({ enum: EstadoCredito }) estado: EstadoCredito;
  @ApiProperty() cuotaMensual: string;
  @ApiProperty({ nullable: true }) diasPromedioPago: number | null;
  @ApiProperty({ enum: EstadoCredito, isArray: true }) transicionesPermitidas: EstadoCredito[];
  @ApiProperty() fechaSolicitud: Date;
  @ApiProperty() fechaActualizacion: Date;
  @ApiProperty({ description: 'ROWVERSION en base64; se devuelve en If-Match al modificar' })
  version: string;
}

/** Datos calculados que no viven en la fila del credito y hay que pasarle al proyectar. */
export interface DatosCalculados {
  cuotaMensual: string;
  diasPromedioPago: number | null;
  transicionesPermitidas: EstadoCredito[];
}

/** Proyecta el credito y su deudor al contrato publico. */
export function aCreditoRespuesta(credito: Credito, calculados: DatosCalculados): CreditoRespuestaDto {
  return {
    id: credito.creditoId,
    numeroCredito: credito.numCredito,
    identificacionAsociado: credito.deudor.identificacion,
    nombreAsociado: credito.deudor.nombreRazonSocial,
    tipoCredito: credito.tipoCredito,
    // El driver a veces devuelve el decimal recortado (15000000 en vez de 15000000.00); se repone aqui.
    valorSolicitado: new Decimal(credito.valorSolicitado).toFixed(2),
    tasaInteres: new Decimal(credito.tasaInteres).toFixed(6),
    numeroCuotas: credito.numCuotas,
    formaPago: credito.formaPago,
    estado: credito.estado,
    cuotaMensual: calculados.cuotaMensual,
    diasPromedioPago: calculados.diasPromedioPago,
    transicionesPermitidas: calculados.transicionesPermitidas,
    fechaSolicitud: credito.fechaSolicitud,
    fechaActualizacion: credito.fechaActualizacion,
    version: credito.rowVersion.toString('base64'),
  };
}
