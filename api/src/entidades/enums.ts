/** Rol dentro de la aplicacion. Eje independiente de TipoPersona. */
export enum TipoUsuario {
  ADMIN = 'ADMIN',
  ANALISTA = 'ANALISTA',
  ASOCIADO = 'ASOCIADO',
}

/** Naturaleza juridica del deudor frente a la ley. */
export enum TipoPersona {
  PERSONA_NATURAL = 'PERSONA_NATURAL',
  PERSONA_JURIDICA = 'PERSONA_JURIDICA',
}

/** Producto de credito solicitado. */
export enum TipoCredito {
  LIBRE_INVERSION = 'LIBRE_INVERSION',
  LIBRANZA = 'LIBRANZA',
  HIPOTECARIO = 'HIPOTECARIO',
  VEHICULO = 'VEHICULO',
  MICROCREDITO = 'MICROCREDITO',
  COMERCIAL = 'COMERCIAL',
}

/** Canal por el que se recauda la cuota. */
export enum FormaPago {
  NOMINA = 'NOMINA',
  CAJA = 'CAJA',
  DEBITO_AUTOMATICO = 'DEBITO_AUTOMATICO',
}

/** Estado del credito dentro de su ciclo de vida. */
export enum EstadoCredito {
  SOLICITADO = 'SOLICITADO',
  EN_ESTUDIO = 'EN_ESTUDIO',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
  DESEMBOLSADO = 'DESEMBOLSADO',
  CANCELADO = 'CANCELADO',
}

/** Estado de una cuota del plan de amortizacion. */
export enum EstadoCuota {
  PENDIENTE = 'PENDIENTE',
  PAGADA = 'PAGADA',
  ANULADA = 'ANULADA',
}

/** Estado de una fila de la bandeja de salida. */
export enum EstadoNotificacion {
  PENDIENTE = 'PENDIENTE',
  ENVIANDO = 'ENVIANDO',
  ENVIADO = 'ENVIADO',
  FALLIDO = 'FALLIDO',
}

/** Tipo de evento publicado hacia sistemas externos. */
export enum EventoNotificacion {
  CREDITO_CREADO = 'credito.creado',
  CREDITO_ESTADO_CAMBIADO = 'credito.estado_cambiado',
}

/** Motivo por el que se cerro una sesion. */
export enum MotivoRevocacion {
  CIERRE_SESION = 'CIERRE_SESION',
  EXPIRACION = 'EXPIRACION',
  REVOCACION_ADMIN = 'REVOCACION_ADMIN',
  CAMBIO_CLAVE = 'CAMBIO_CLAVE',
}

/** Sistema de amortizacion con el que se arma el plan de pagos. */
export enum SistemaAmortizacion {
  FRANCES = 'FRANCES',
  ALEMAN = 'ALEMAN',
}

/** Lista de valores de un enum, lista para incrustar en un CHECK de SQL Server. */
export const listaSql = (e: Record<string, string>): string =>
  Object.values(e)
    .map((v) => `'${v}'`)
    .join(',');
