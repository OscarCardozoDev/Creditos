/** Formateo para presentación. Vive en la vista: el servidor envía números, no textos. */

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const PESOS_CENTAVOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
})

const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'UTC',
})

/**
 * Formatea un monto en pesos sin centavos, para tablas y tarjetas.
 * La API los envía como texto decimal; aquí se convierten solo para mostrarlos,
 * nunca para operar con ellos. Un valor ausente se muestra como raya, no como NaN:
 * un campo que el servidor todavía no envía no debe verse como un dato roto.
 */
export const pesos = (n: string | number | null | undefined) =>
  Number.isFinite(Number(n)) && n !== null && n !== '' ? PESOS.format(Number(n)) : '—'

/** Formatea un monto en pesos con centavos, para cuotas y totales. */
export const pesosExactos = (n: string | number | null | undefined) =>
  Number.isFinite(Number(n)) && n !== null && n !== '' ? PESOS_CENTAVOS.format(Number(n)) : '—'

/** Formatea una fecha ISO como dd/mm/aa en UTC. */
export const fechaCorta = (iso: string) => FECHA_CORTA.format(new Date(iso))

/** Formatea una fecha ISO como dd/mm/aaaa hh:mm UTC, para la bitácora. */
export function fechaLarga(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

/** Formatea una tasa con los seis decimales de `DECIMAL(9,6)`. */
export const tasa = (n: string | number) => `${Number(n).toFixed(6).replace('.', ',')} %`
