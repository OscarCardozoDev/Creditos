import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ReglaNegocioException } from '../comun/errores/excepciones';
import { SistemaAmortizacion, TipoCredito } from '../entidades/enums';
import { eaAMensualVencida, FilaAmortizacion, tablaAlemana, tablaFrancesa } from './amortizacion';
import { SimularDto } from './dto/simular.dto';
import { parametrosDe } from './productos';
import { mensualAEfectivaAnual, porcentajeATantoPorUno, tantoPorUnoAPorcentaje } from './tasas';

export interface ResultadoSimulacion {
  tipoCredito: TipoCredito;
  sistema: SistemaAmortizacion;
  valorSolicitado: string;
  numeroCuotas: number;
  /** Porcentaje mensual, igual que en el contrato de creditos: 1.500000 es 1,5 %. */
  tasaInteres: string;
  cuotaMensual: string;
  totalPagado: string;
  totalIntereses: string;
  tabla: FilaAmortizacion[];
}

/** Modulo puro: no consulta la base, no hace red y no depende de nada del framework. */
@Injectable()
export class SimulacionService {
  /** Simula un credito completo: cuota, totales y plan periodo a periodo. */
  simular(datos: SimularDto): ResultadoSimulacion {
    this.exigirPlazoDentroDelProducto(datos.tipoCredito, datos.numeroCuotas);

    const tasaInteres = this.resolverTasa(datos.tipoCredito, datos.tasaInteres);
    const sistema = datos.sistema ?? parametrosDe(datos.tipoCredito).sistema;
    const tabla = this.construirTabla(sistema, datos.valorSolicitado, tasaInteres, datos.numeroCuotas);

    return {
      tipoCredito: datos.tipoCredito,
      sistema,
      valorSolicitado: new Decimal(datos.valorSolicitado).toFixed(2),
      numeroCuotas: datos.numeroCuotas,
      tasaInteres: tasaInteres.toFixed(6),
      cuotaMensual: tabla[0].valorCuota,
      totalPagado: this.sumar(tabla, 'valorCuota'),
      totalIntereses: this.sumar(tabla, 'abonoInteres'),
      tabla,
    };
  }

  /** Devuelve la tasa mensual de politica del producto, en porcentaje. */
  tasaDePolitica(tipoCredito: TipoCredito): Decimal {
    const mensual = eaAMensualVencida(parametrosDe(tipoCredito).tasaEA);
    return tantoPorUnoAPorcentaje(mensual);
  }

  /** Arma el plan de amortizacion de un credito, con el sistema y la tasa que ya tiene pactados. */
  planDePagos(
    tipoCredito: TipoCredito,
    capital: Decimal.Value,
    tasaInteres: Decimal.Value,
    cuotas: number,
  ): FilaAmortizacion[] {
    return this.construirTabla(parametrosDe(tipoCredito).sistema, capital, tasaInteres, cuotas);
  }

  /** Rechaza un plazo que el producto no admite. */
  exigirPlazoDentroDelProducto(tipoCredito: TipoCredito, numeroCuotas: number): void {
    const maximo = parametrosDe(tipoCredito).cuotasMaximas;
    if (numeroCuotas > maximo) {
      throw new ReglaNegocioException(`El producto ${tipoCredito} admite hasta ${maximo} cuotas.`);
    }
  }

  /** Rechaza una tasa fuera de la banda del producto: se negocia dentro de un margen, no se inventa. */
  exigirTasaEnBanda(tipoCredito: TipoCredito, tasaInteres: Decimal.Value): void {
    const producto = parametrosDe(tipoCredito);
    const efectivaAnual = mensualAEfectivaAnual(porcentajeATantoPorUno(tasaInteres));

    if (efectivaAnual.lessThan(producto.bandaMinimaEA) || efectivaAnual.greaterThan(producto.bandaMaximaEA)) {
      const min = new Decimal(producto.bandaMinimaEA).times(100).toFixed(1);
      const max = new Decimal(producto.bandaMaximaEA).times(100).toFixed(1);
      throw new ReglaNegocioException(
        `La tasa de ${tipoCredito} debe quedar entre ${min} % y ${max} % efectivo anual.`,
      );
    }
  }

  /** Usa la tasa pedida si viene y cae en la banda; si no viene, impone la de politica. */
  private resolverTasa(tipoCredito: TipoCredito, tasaPedida?: number): Decimal {
    if (tasaPedida === undefined) {
      return this.tasaDePolitica(tipoCredito);
    }
    this.exigirTasaEnBanda(tipoCredito, tasaPedida);
    return new Decimal(tasaPedida);
  }

  /** Elige el motor segun el sistema de amortizacion y le pasa la tasa en tanto por uno. */
  private construirTabla(
    sistema: SistemaAmortizacion,
    capital: Decimal.Value,
    tasaInteres: Decimal.Value,
    cuotas: number,
  ): FilaAmortizacion[] {
    const tasa = porcentajeATantoPorUno(tasaInteres);
    if (sistema === SistemaAmortizacion.ALEMAN) {
      return tablaAlemana(capital, tasa, cuotas);
    }
    return tablaFrancesa(capital, tasa, cuotas);
  }

  /** Suma una columna de la tabla sin perder precision. */
  private sumar(tabla: FilaAmortizacion[], columna: 'valorCuota' | 'abonoInteres' | 'abonoCapital'): string {
    return tabla.reduce((total, fila) => total.plus(fila[columna]), new Decimal(0)).toFixed(2);
  }
}
