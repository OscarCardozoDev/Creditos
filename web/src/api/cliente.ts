import type { CodigoError, Meta, RespuestaError } from './tipos'

const BASE = '/api'

/**
 * Error de la API con el código estable del catálogo.
 * Las pantallas deciden qué mostrar mirando `codigo`, nunca el texto del mensaje.
 */
export class ErrorApi extends Error {
  readonly estado: number
  readonly codigo: CodigoError
  readonly detalles: unknown[]
  readonly requestId: string

  constructor(
    estado: number,
    codigo: CodigoError,
    mensaje: string,
    detalles: unknown[],
    requestId: string,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.codigo = codigo
    this.detalles = detalles
    this.requestId = requestId
  }

  /** Indica si el error trae mensajes por campo para pintarlos bajo cada control. */
  get esDeValidacion(): boolean {
    return this.codigo === 'VALIDATION_ERROR'
  }
}

/** Error de transporte: la petición nunca llegó a producir una respuesta de la API. */
export class ErrorRed extends Error {
  constructor(causa: unknown) {
    super('No se pudo contactar el servidor.')
    this.name = 'ErrorRed'
    this.cause = causa
  }
}

/**
 * Lee la cookie `csrf-token`, que el servidor escribe sin HttpOnly justamente para esto.
 * La política de mismo origen impide que otro sitio la lea, aunque el navegador sí la envíe.
 */
function tokenCsrf(): string | null {
  const par = document.cookie.split('; ').find((c) => c.startsWith('csrf-token='))
  return par ? decodeURIComponent(par.slice('csrf-token='.length)) : null
}

const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS']

interface Opciones {
  metodo?: string
  cuerpo?: unknown
  /** Versión leída del recurso; viaja en If-Match para el control de concurrencia optimista. */
  version?: string
  consulta?: object
}

/** Arma la cadena de consulta descartando los parámetros vacíos. */
function aConsulta(consulta: Opciones['consulta']): string {
  if (!consulta) return ''
  const p = new URLSearchParams()
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== null && valor !== '') p.set(clave, String(valor))
  }
  const cadena = p.toString()
  return cadena ? `?${cadena}` : ''
}

/**
 * Ejecuta una petición contra la API y devuelve `data` ya desempaquetado.
 * Un `401` significa que la sesión terminó: se manda al acceso, porque no hay
 * token que renovar y cualquier reintento volvería a fallar igual.
 */
export async function peticion<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { datos } = await peticionConMeta<T>(ruta, opciones)
  return datos
}

/** Igual que `peticion`, pero conserva el `meta` de paginación que traen los listados. */
export async function peticionConMeta<T>(
  ruta: string,
  opciones: Opciones = {},
): Promise<{ datos: T; meta?: Meta }> {
  const metodo = opciones.metodo ?? 'GET'
  const cabeceras: Record<string, string> = {}

  if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
  if (opciones.version) cabeceras['If-Match'] = opciones.version

  // Toda escritura copia el token de la cookie a la cabecera; el servidor exige que coincidan.
  if (!METODOS_SEGUROS.includes(metodo)) {
    const csrf = tokenCsrf()
    if (csrf) cabeceras['X-CSRF-Token'] = csrf
  }

  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE}${ruta}${aConsulta(opciones.consulta)}`, {
      method: metodo,
      headers: cabeceras,
      // Sin esto el navegador no adjunta la cookie y la API responde 401 de forma sistemática.
      credentials: 'include',
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    })
  } catch (causa) {
    throw new ErrorRed(causa)
  }

  if (respuesta.status === 204) return { datos: undefined as T }

  const cuerpo: unknown = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const error = aErrorApi(respuesta.status, cuerpo)
    if (SESION_TERMINADA.includes(error.codigo)) irAlAcceso()
    throw error
  }

  const sobre = cuerpo as { data: T; meta?: Meta }
  return { datos: sobre.data, meta: sobre.meta }
}

/**
 * Códigos que significan que la sesión ya no vale.
 * `CREDENCIALES_INVALIDAS` también responde 401 y queda fuera a propósito: es un intento de
 * acceso fallido, no una sesión caída, y redirigir desde el propio acceso sería un bucle.
 */
const SESION_TERMINADA: CodigoError[] = [
  'NO_AUTENTICADO',
  'SESION_INVALIDA',
  'SESION_EXPIRADA',
  'SESION_REVOCADA',
]

/** Manda al acceso conservando a dónde iba el usuario, salvo que ya esté allí. */
function irAlAcceso(): void {
  if (window.location.pathname === '/login') return
  const destino = window.location.pathname + window.location.search
  // Recarga completa a propósito: descarta cualquier dato en memoria de la sesión anterior.
  window.location.assign(`/login?sesion=terminada&volver=${encodeURIComponent(destino)}`)
}

/** Traduce el cuerpo de error de la API a `ErrorApi`, con un respaldo si no vino con formato. */
function aErrorApi(estado: number, cuerpo: unknown): ErrorApi {
  const error = (cuerpo as RespuestaError | null)?.error
  if (!error) {
    return new ErrorApi(estado, 'ERROR_INTERNO', 'Ocurrió un error inesperado.', [], '')
  }
  return new ErrorApi(estado, error.code, error.message, error.details ?? [], error.requestId)
}

/**
 * Devuelve los mensajes por campo de un 400 VALIDATION_ERROR, para pintarlos bajo cada control.
 * `ValidationPipe` los envía como texto plano empezando por el nombre de la propiedad
 * ("numeroCuotas must be an integer number"), así que el campo es la primera palabra.
 */
export function erroresPorCampo(error: unknown): Record<string, string> {
  if (!(error instanceof ErrorApi) || !error.esDeValidacion) return {}
  const salida: Record<string, string> = {}
  for (const detalle of error.detalles) {
    if (typeof detalle !== 'string') continue
    const campo = detalle.split(' ')[0]
    // Solo el primer mensaje por campo: los demás repiten la misma regla desde otro validador.
    if (campo && !salida[campo]) salida[campo] = detalle
  }
  return salida
}
