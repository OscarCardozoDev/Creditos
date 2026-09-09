/** Techo del retroceso exponencial, para que un intento muy tardio no espere horas. */
const TOPE_SEGUNDOS = 256;

/** Dice si vale la pena reintentar: 5xx, 408 y 429 son transitorios; el resto de 4xx no. */
export function esTransitorio(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Calcula el proximo intento con retroceso exponencial (1s, 2s, 4s, 8s...) mas dispersion
 * aleatoria. La dispersion importa: sin ella, cuando el tercero se recupera, todos los eventos
 * pendientes le caen en el mismo instante y lo vuelven a tumbar.
 */
export function proximoIntento(intentos: number): Date {
  const base = Math.min(2 ** Math.max(intentos - 1, 0), TOPE_SEGUNDOS) * 1000;
  const dispersion = Math.random() * base * 0.5;
  return new Date(Date.now() + base + dispersion);
}
