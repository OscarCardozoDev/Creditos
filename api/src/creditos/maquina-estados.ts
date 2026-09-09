import { EstadoCredito } from '../entidades/enums';

/**
 * Destinos validos desde cada estado. Es un mapa de datos y no una cadena de condicionales:
 * se lee de un vistazo, se prueba tabular y se cambia sin tocar logica.
 */
export const TRANSICIONES: Record<EstadoCredito, EstadoCredito[]> = {
  // Quien estudia la solicitud es quien la decide: un estado intermedio que siempre recorre la
  // misma persona no aporta control, solo un clic y una fila de bitacora sin informacion.
  [EstadoCredito.SOLICITADO]: [EstadoCredito.APROBADO, EstadoCredito.RECHAZADO, EstadoCredito.CANCELADO],
  // Ya no se alcanza. Se conserva para que un credito anterior al cambio pueda terminar su vida.
  [EstadoCredito.EN_ESTUDIO]: [EstadoCredito.APROBADO, EstadoCredito.RECHAZADO, EstadoCredito.CANCELADO],
  [EstadoCredito.APROBADO]: [EstadoCredito.DESEMBOLSADO, EstadoCredito.CANCELADO],
  [EstadoCredito.RECHAZADO]: [],
  [EstadoCredito.DESEMBOLSADO]: [],
  [EstadoCredito.CANCELADO]: [],
};

/** Estados en los que todavia se pueden editar las condiciones financieras del credito. */
export const ESTADOS_EDITABLES: EstadoCredito[] = [EstadoCredito.SOLICITADO, EstadoCredito.EN_ESTUDIO];

/** Estados a los que no se puede llegar sin explicar por que. */
export const ESTADOS_QUE_EXIGEN_OBSERVACION: EstadoCredito[] = [EstadoCredito.RECHAZADO, EstadoCredito.CANCELADO];

/** Devuelve los destinos validos desde un estado, o vacio si es terminal. */
export function destinosPermitidos(estado: EstadoCredito): EstadoCredito[] {
  return TRANSICIONES[estado];
}

/** Dice si el salto de un estado a otro esta permitido. */
export function esTransicionValida(desde: EstadoCredito, hasta: EstadoCredito): boolean {
  return destinosPermitidos(desde).includes(hasta);
}
