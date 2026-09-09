import { peticion, peticionConMeta } from './cliente'
import type {
  ActualizarCredito,
  CambiarEstado,
  CrearCredito,
  Credito,
  Cuota,
  EntradaHistorial,
  FiltrosCreditos,
  Meta,
  RegistrarPago,
  ResumenCreditos,
} from './tipos'

/** Registra una solicitud de crédito. */
export function crear(datos: CrearCredito): Promise<Credito> {
  return peticion('/creditos', { metodo: 'POST', cuerpo: datos })
}

/** Devuelve la página de créditos que piden los filtros, junto con su `meta` de paginación. */
export async function listar(
  filtros: FiltrosCreditos = {},
): Promise<{ data: Credito[]; meta: Meta }> {
  const { datos, meta } = await peticionConMeta<Credito[]>('/creditos', { consulta: filtros })
  return { data: datos, meta: meta as Meta }
}

/** Devuelve el conteo por estado y el total, resuelto en SQL con un GROUP BY. */
export function resumen(): Promise<ResumenCreditos> {
  return peticion('/creditos/resumen')
}

/** Devuelve un crédito con su cuota mensual y las transiciones posibles desde su estado. */
export function obtener(id: string): Promise<Credito> {
  return peticion(`/creditos/${id}`)
}

/** Devuelve la bitácora del crédito, de la entrada más reciente a la más antigua. */
export function historial(id: string): Promise<EntradaHistorial[]> {
  return peticion(`/creditos/${id}/historial`)
}

/** Devuelve el plan de amortización del crédito, ordenado por número de cuota. */
export function cuotas(id: string): Promise<Cuota[]> {
  return peticion(`/creditos/${id}/cuotas`)
}

/**
 * Modifica las condiciones editables del crédito.
 * `version` es la que se leyó del recurso y viaja en `If-Match`: si otro usuario escribió
 * antes, el servidor responde 409 CONCURRENCIA_CONFLICTO en vez de pisar su trabajo.
 */
export function actualizar(
  id: string,
  datos: ActualizarCredito,
  version: string,
): Promise<Credito> {
  return peticion(`/creditos/${id}`, { metodo: 'PATCH', cuerpo: datos, version })
}

/** Avanza el estado del crédito; el servidor valida la transición y escribe la bitácora. */
export function cambiarEstado(id: string, datos: CambiarEstado): Promise<Credito> {
  return peticion(`/creditos/${id}/estado`, { metodo: 'PATCH', cuerpo: datos })
}

/** Registra el pago de una cuota concreta del plan. */
export function pagarCuota(id: string, numero: number, datos: RegistrarPago): Promise<Cuota> {
  return peticion(`/creditos/${id}/cuotas/${numero}/pago`, { metodo: 'POST', cuerpo: datos })
}

/** Oculta el crédito de los listados sin borrar la fila. Solo ADMIN. */
export function borrar(id: string): Promise<void> {
  return peticion(`/creditos/${id}`, { metodo: 'DELETE' })
}
