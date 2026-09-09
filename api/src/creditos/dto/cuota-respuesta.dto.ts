import { ApiProperty } from '@nestjs/swagger';
import Decimal from 'decimal.js';
import { Cuota } from '../../entidades/cuota.entidad';
import { EstadoCuota } from '../../entidades/enums';

/** Una fila del plan de amortizacion tal como cruza al cliente. */
export class CuotaRespuestaDto {
  @ApiProperty() numeroCuota: number;
  @ApiProperty() fechaVencimiento: string;
  @ApiProperty() valorCuota: string;
  @ApiProperty() abonoCapital: string;
  @ApiProperty() abonoInteres: string;
  @ApiProperty() saldoPosterior: string;
  @ApiProperty({ enum: EstadoCuota }) estado: EstadoCuota;
  @ApiProperty({ nullable: true }) fechaPago: string | null;
  @ApiProperty({ nullable: true }) valorPagado: string | null;
}

/** Proyecta la cuota persistida al contrato publico. */
export function aCuotaRespuesta(cuota: Cuota): CuotaRespuestaDto {
  return {
    numeroCuota: cuota.numeroCuota,
    fechaVencimiento: cuota.fechaVencimiento,
    // El driver a veces devuelve el decimal recortado (532301.5 en vez de 532301.50); se repone aqui.
    valorCuota: new Decimal(cuota.valorCuota).toFixed(2),
    abonoCapital: new Decimal(cuota.abonoCapital).toFixed(2),
    abonoInteres: new Decimal(cuota.abonoInteres).toFixed(2),
    saldoPosterior: new Decimal(cuota.saldoPosterior).toFixed(2),
    estado: cuota.estado,
    fechaPago: cuota.fechaPago,
    valorPagado: cuota.valorPagado === null ? null : new Decimal(cuota.valorPagado).toFixed(2),
  };
}
