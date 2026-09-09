import { peticion } from './cliente'
import type { Simulacion, Simular } from './tipos'

/**
 * Calcula cuota, totales y plan periodo a periodo sin escribir nada.
 * Es `POST` porque el cuerpo lleva los parámetros del cálculo, no porque cree un recurso.
 */
export function simular(datos: Simular): Promise<Simulacion> {
  return peticion('/simulacion', { metodo: 'POST', cuerpo: datos })
}
