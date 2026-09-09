import { SistemaAmortizacion, TipoCredito, TipoPersona } from '../entidades/enums';

export interface ParametrosProducto {
  sistema: SistemaAmortizacion;
  /** Tasa efectiva anual de politica, en tanto por uno. */
  tasaEA: string;
  /** Banda dentro de la que un analista puede negociar, en tanto por uno anual. */
  bandaMinimaEA: string;
  bandaMaximaEA: string;
  cuotasMaximas: number;
  /** Perfiles que pueden tomar el producto. */
  perfiles: TipoPersona[];
}

/**
 * Politica de la entidad, no tasas de una fuente oficial vigente. La escala refleja el riesgo:
 * la libranza es la mas barata porque se descuenta de nomina, el microcredito la mas cara.
 */
export const PRODUCTOS: Record<TipoCredito, ParametrosProducto> = {
  [TipoCredito.LIBRE_INVERSION]: {
    sistema: SistemaAmortizacion.FRANCES,
    tasaEA: '0.18',
    bandaMinimaEA: '0.14',
    bandaMaximaEA: '0.24',
    cuotasMaximas: 72,
    perfiles: [TipoPersona.PERSONA_NATURAL],
  },
  [TipoCredito.LIBRANZA]: {
    sistema: SistemaAmortizacion.FRANCES,
    tasaEA: '0.12',
    bandaMinimaEA: '0.10',
    bandaMaximaEA: '0.16',
    cuotasMaximas: 84,
    perfiles: [TipoPersona.PERSONA_NATURAL],
  },
  [TipoCredito.HIPOTECARIO]: {
    sistema: SistemaAmortizacion.FRANCES,
    tasaEA: '0.11',
    bandaMinimaEA: '0.09',
    bandaMaximaEA: '0.15',
    cuotasMaximas: 240,
    perfiles: [TipoPersona.PERSONA_NATURAL],
  },
  [TipoCredito.VEHICULO]: {
    sistema: SistemaAmortizacion.FRANCES,
    tasaEA: '0.14',
    bandaMinimaEA: '0.12',
    bandaMaximaEA: '0.20',
    cuotasMaximas: 84,
    perfiles: [TipoPersona.PERSONA_NATURAL],
  },
  [TipoCredito.MICROCREDITO]: {
    sistema: SistemaAmortizacion.FRANCES,
    tasaEA: '0.28',
    bandaMinimaEA: '0.22',
    bandaMaximaEA: '0.36',
    cuotasMaximas: 36,
    perfiles: [TipoPersona.PERSONA_NATURAL, TipoPersona.PERSONA_JURIDICA],
  },
  [TipoCredito.COMERCIAL]: {
    // Aleman: una empresa con flujo de caja prefiere amortizar capital rapido.
    sistema: SistemaAmortizacion.ALEMAN,
    tasaEA: '0.16',
    bandaMinimaEA: '0.12',
    bandaMaximaEA: '0.22',
    cuotasMaximas: 120,
    // El credito empresarial no se otorga a personas naturales.
    perfiles: [TipoPersona.PERSONA_JURIDICA],
  },
};

/** Devuelve los parametros del producto pedido. */
export function parametrosDe(tipoCredito: TipoCredito): ParametrosProducto {
  return PRODUCTOS[tipoCredito];
}
