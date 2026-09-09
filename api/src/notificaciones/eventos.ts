import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { Credito } from '../entidades/credito.entidad';
import { EstadoCredito, EventoNotificacion } from '../entidades/enums';

/** Cuerpo del evento tal como sale hacia el sistema externo. Se guarda igual que se envia. */
export interface CuerpoEvento {
  event: EventoNotificacion;
  eventId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Normaliza un monto a dos decimales. El valor recien escrito conserva el formato de
 * `Decimal.toFixed(2)`, pero el que vuelve de SQL Server llega sin los decimales a cero: sin esto
 * el mismo campo sale como "12300000.00" al crear y como "12300000" al cambiar de estado.
 */
function monto(valor: string): string {
  return new Decimal(valor).toFixed(2);
}

/** Arma el evento de credito recien registrado. */
export function eventoCreditoCreado(credito: Credito, identificacionAsociado: string): CuerpoEvento {
  return armar(EventoNotificacion.CREDITO_CREADO, {
    id: credito.creditoId,
    numeroCredito: credito.numCredito,
    identificacionAsociado,
    valorSolicitado: monto(credito.valorSolicitado),
    estado: credito.estado,
  });
}

/** Arma el evento de cambio de estado, con el estado del que viene y al que va. */
export function eventoEstadoCambiado(
  credito: Credito,
  identificacionAsociado: string,
  estadoAnterior: EstadoCredito,
  estadoNuevo: EstadoCredito,
): CuerpoEvento {
  return armar(EventoNotificacion.CREDITO_ESTADO_CAMBIADO, {
    id: credito.creditoId,
    numeroCredito: credito.numCredito,
    identificacionAsociado,
    valorSolicitado: monto(credito.valorSolicitado),
    estadoAnterior,
    estadoNuevo,
  });
}

/** Pone la envoltura comun: tipo de evento, clave de idempotencia y momento. */
function armar(event: EventoNotificacion, data: Record<string, unknown>): CuerpoEvento {
  return { event, eventId: randomUUID(), timestamp: new Date().toISOString(), data };
}
