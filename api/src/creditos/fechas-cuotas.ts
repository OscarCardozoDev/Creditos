/** Suma N meses a una fecha; si el dia no existe en el mes destino, usa el ultimo dia de ese mes. */
export function sumarMeses(fecha: Date, meses: number): Date {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth();
  const dia = fecha.getUTCDate();

  // Dia 0 del mes siguiente al destino es el ultimo dia del mes destino.
  const ultimoDiaDestino = new Date(Date.UTC(anio, mes + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes + meses, Math.min(dia, ultimoDiaDestino)));
}

/** Formatea una fecha como el DATE de SQL Server (YYYY-MM-DD), sin hora. */
export function aFechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
