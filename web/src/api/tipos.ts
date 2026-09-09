/**
 * Contrato de la API, declarado una sola vez.
 * Refleja los DTO de respuesta de cada módulo de `api/src` y los enums de
 * `api/src/entidades/enums.ts`.
 * Si el backend cambia, se cambia aquí; ninguna pantalla define tipos de datos del servidor.
 *
 * Los montos y las tasas viajan como `string`, no como `number`: son DECIMAL(18,2) y
 * DECIMAL(9,6) y el punto flotante no los representa. El cliente los muestra y los reenvía,
 * nunca opera con ellos.
 */

export type Estado =
  | 'SOLICITADO'
  | 'EN_ESTUDIO'
  | 'APROBADO'
  | 'DESEMBOLSADO'
  | 'RECHAZADO'
  | 'CANCELADO'

export type TipoCredito =
  | 'LIBRE_INVERSION'
  | 'LIBRANZA'
  | 'HIPOTECARIO'
  | 'VEHICULO'
  | 'MICROCREDITO'
  | 'COMERCIAL'

export type FormaPago = 'NOMINA' | 'CAJA' | 'DEBITO_AUTOMATICO'

export type Rol = 'ADMIN' | 'ANALISTA' | 'ASOCIADO'

export type TipoPersona = 'PERSONA_NATURAL' | 'PERSONA_JURIDICA'

export type SistemaAmortizacion = 'FRANCES' | 'ALEMAN'

export type EstadoCuota = 'PENDIENTE' | 'PAGADA' | 'ANULADA'

/** Catálogo de códigos de error. Un código que no esté aquí no existe. */
export type CodigoError =
  | 'VALIDATION_ERROR'
  | 'NO_AUTENTICADO'
  | 'SESION_INVALIDA'
  | 'SESION_EXPIRADA'
  | 'SESION_REVOCADA'
  | 'CREDENCIALES_INVALIDAS'
  | 'CSRF_INVALIDO'
  | 'FIRMA_INVALIDA'
  | 'SIN_PERMISO'
  | 'USUARIO_INACTIVO'
  | 'RECURSO_NOT_FOUND'
  | 'CREDITO_NOT_FOUND'
  | 'USUARIO_NOT_FOUND'
  | 'CUOTA_NOT_FOUND'
  | 'CREDITO_DUPLICADO'
  | 'USUARIO_DUPLICADO'
  | 'CONCURRENCIA_CONFLICTO'
  | 'TRANSICION_INVALIDA'
  | 'REGLA_NEGOCIO'
  | 'CREDITO_INMUTABLE'
  | 'DEMASIADAS_PETICIONES'
  | 'ERROR_INTERNO'

export interface RespuestaError {
  success: false
  error: {
    code: CodigoError
    message: string
    details: unknown[]
    requestId: string
  }
}

export interface Meta {
  page: number
  limit: number
  total: number
  totalPages: number
}

// --- Sesión -----------------------------------------------------------------

/** Usuario de la sesión en curso, tal como lo devuelve `GET /auth/yo`. */
export interface UsuarioSesion {
  usuarioId: string
  nombre: string
  rol: Rol
  /** Perfil del deudor: decide qué productos se le pueden ofrecer cuando pide para sí mismo. */
  tipoPersona: TipoPersona
}

export interface SesionActiva {
  id: string
  creadaEn: string
  ultimoAcceso: string
  expiraEn: string
  ip: string | null
  agenteUsuario: string | null
  esLaActual: boolean
}

// --- Créditos ---------------------------------------------------------------

export interface Credito {
  id: string
  numeroCredito: string
  identificacionAsociado: string
  nombreAsociado: string
  tipoCredito: TipoCredito
  /** DECIMAL(18,2) en texto. */
  valorSolicitado: string
  /** Porcentaje **mensual** con seis decimales: `1.500000` es 1,5 % mensual. */
  tasaInteres: string
  numeroCuotas: number
  formaPago: FormaPago
  estado: Estado
  cuotaMensual: string
  diasPromedioPago: number | null
  /** La máquina de estados la resuelve el backend; el navegador solo la pinta. */
  transicionesPermitidas: Estado[]
  fechaSolicitud: string
  fechaActualizacion: string
  /** ROWVERSION en base64; se devuelve en `If-Match` al modificar. */
  version: string
}

export interface EntradaHistorial {
  estadoAnterior: Estado | null
  estadoNuevo: Estado
  usuarioId: string | null
  usuarioNombre: string
  observacion: string | null
  fecha: string
}

export interface Cuota {
  numeroCuota: number
  fechaVencimiento: string
  valorCuota: string
  abonoCapital: string
  abonoInteres: string
  saldoPosterior: string
  estado: EstadoCuota
  fechaPago: string | null
  valorPagado: string | null
}

export interface ResumenCreditos {
  total: number
  porEstado: { estado: Estado; total: number }[]
  montoTotalSolicitado: string
  /** Incluye DESEMBOLSADO: excluirlo haría bajar el monto cuando el crédito avanza de estado. */
  montoAprobado: string
}

export interface FiltrosCreditos {
  page?: number
  limit?: number
  sort?: string
  estado?: Estado
  tipoCredito?: TipoCredito
  identificacion?: string
  desde?: string
  hasta?: string
  q?: string
}

export interface CrearCredito {
  /** Obligatorios para ANALISTA y ADMIN. Un ASOCIADO no los envía: salen de su sesión. */
  identificacionAsociado?: string
  nombreAsociado?: string
  /** Solo se usa si el asociado aún no existe. */
  tipoPersona?: TipoPersona
  tipoCredito: TipoCredito
  valorSolicitado: number
  /** Porcentaje mensual. Un ASOCIADO no puede fijarla: el servidor la ignora y aplica política. */
  tasaInteres?: number
  numeroCuotas: number
  formaPago: FormaPago
}

export interface ActualizarCredito {
  valorSolicitado?: number
  tasaInteres?: number
  numeroCuotas?: number
  formaPago?: FormaPago
}

export interface CambiarEstado {
  estado: Estado
  /** Obligatoria al pasar a RECHAZADO o CANCELADO. */
  observacion?: string
}

export interface RegistrarPago {
  /** Día del calendario (`aaaa-mm-dd`), no un instante. No puede ser futuro. */
  fechaPago: string
  valorPagado: number
}

// --- Simulación -------------------------------------------------------------

export interface FilaAmortizacion {
  numeroCuota: number
  valorCuota: string
  abonoCapital: string
  abonoInteres: string
  saldoPosterior: string
}

export interface Simulacion {
  tipoCredito: TipoCredito
  sistema: SistemaAmortizacion
  valorSolicitado: string
  numeroCuotas: number
  /** Porcentaje mensual, igual que en el contrato de créditos. */
  tasaInteres: string
  cuotaMensual: string
  totalPagado: string
  totalIntereses: string
  tabla: FilaAmortizacion[]
}

export interface Simular {
  tipoCredito: TipoCredito
  valorSolicitado: number
  numeroCuotas: number
  /** Porcentaje mensual. Si no viene, se usa la tasa de política del producto. */
  tasaInteres?: number
  /** Por defecto, el sistema del producto. */
  sistema?: SistemaAmortizacion
}

// --- Usuarios ---------------------------------------------------------------

export interface Usuario {
  usuarioId: string
  identificacion: string
  nombreRazonSocial: string
  tipoPersona: TipoPersona
  tipoUsuario: Rol
  activo: boolean
  creadoEn: string
}

export interface CrearUsuario {
  identificacion: string
  nombreRazonSocial: string
  tipoPersona: TipoPersona
  tipoUsuario: Rol
  /** Correo y contraseña van juntos. Sin ellos el usuario existe solo como deudor. */
  correo?: string
  password?: string
}

export interface FiltrosUsuarios {
  page?: number
  limit?: number
  sort?: string
  q?: string
  tipoUsuario?: Rol
  tipoPersona?: TipoPersona
}

export const ROLES: Rol[] = ['ADMIN', 'ANALISTA', 'ASOCIADO']

/**
 * Roles que el formulario de alta puede crear. ADMIN queda fuera: se aprovisiona con la carga
 * inicial, y el servidor rechaza el intento con 422 aunque alguien fuerce la petición.
 */
export const ROLES_CREABLES: Rol[] = ['ANALISTA', 'ASOCIADO']

export const TIPOS_PERSONA: TipoPersona[] = ['PERSONA_NATURAL', 'PERSONA_JURIDICA']

/** Los roles que operan el sistema exigen credenciales; el asociado puede existir sin ellas. */
export const ROLES_QUE_OPERAN: Rol[] = ['ADMIN', 'ANALISTA']

/** Mismo mínimo que impone `CrearUsuarioDto` en la API. */
export const LARGO_MINIMO_PASSWORD = 12

// --- Constantes del dominio -------------------------------------------------

export const ESTADOS: Estado[] = [
  'SOLICITADO',
  'EN_ESTUDIO',
  'APROBADO',
  'DESEMBOLSADO',
  'RECHAZADO',
  'CANCELADO',
]

/**
 * Estados que el flujo actual puede alcanzar. `EN_ESTUDIO` quedó fuera al dejar de ser un paso,
 * pero sigue en `ESTADOS` porque un crédito anterior al cambio puede estar todavía en él.
 */
export const ESTADOS_VIGENTES: Estado[] = ESTADOS.filter((e) => e !== 'EN_ESTUDIO')

export const TIPOS_CREDITO: TipoCredito[] = [
  'LIBRE_INVERSION',
  'LIBRANZA',
  'HIPOTECARIO',
  'VEHICULO',
  'MICROCREDITO',
  'COMERCIAL',
]

export const FORMAS_PAGO: FormaPago[] = ['NOMINA', 'CAJA', 'DEBITO_AUTOMATICO']

/** La observación es obligatoria en estas transiciones, igual que en `CambiarEstadoDto`. */
export const EXIGEN_OBSERVACION: Estado[] = ['RECHAZADO', 'CANCELADO']

/** Largo mínimo y máximo de la observación, los mismos que impone `CambiarEstadoDto`. */
export const OBSERVACION_MINIMA = 3
export const OBSERVACION_MAXIMA = 500

/** Tope duro del listado, el mismo que impone `PaginacionDto`. */
export const LIMITE_MAXIMO = 100

/**
 * Espejo de `api/src/simulacion/productos.ts`, solo para rotular la interfaz
 * (sistema, plazo máximo y banda). El cálculo y la validación viven en el servidor.
 */
export const PRODUCTOS: Record<
  TipoCredito,
  {
    sistema: SistemaAmortizacion
    tasaEA: number
    bandaEA: [number, number]
    cuotasMaximas: number
    /** Perfiles que admite el producto. El servidor lo vuelve a exigir con un 422. */
    perfiles: TipoPersona[]
  }
> = {
  LIBRE_INVERSION: { sistema: 'FRANCES', tasaEA: 18, bandaEA: [14, 24], cuotasMaximas: 72, perfiles: ['PERSONA_NATURAL'] },
  LIBRANZA: { sistema: 'FRANCES', tasaEA: 12, bandaEA: [10, 16], cuotasMaximas: 84, perfiles: ['PERSONA_NATURAL'] },
  HIPOTECARIO: { sistema: 'FRANCES', tasaEA: 11, bandaEA: [9, 15], cuotasMaximas: 240, perfiles: ['PERSONA_NATURAL'] },
  VEHICULO: { sistema: 'FRANCES', tasaEA: 14, bandaEA: [12, 20], cuotasMaximas: 84, perfiles: ['PERSONA_NATURAL'] },
  MICROCREDITO: {
    sistema: 'FRANCES',
    tasaEA: 28,
    bandaEA: [22, 36],
    cuotasMaximas: 36,
    perfiles: ['PERSONA_NATURAL', 'PERSONA_JURIDICA'],
  },
  COMERCIAL: { sistema: 'ALEMAN', tasaEA: 16, bandaEA: [12, 22], cuotasMaximas: 120, perfiles: ['PERSONA_JURIDICA'] },
}

/** Productos que puede tomar un perfil, en el orden del catálogo. */
export function productosDe(tipoPersona: TipoPersona): TipoCredito[] {
  return TIPOS_CREDITO.filter((t) => PRODUCTOS[t].perfiles.includes(tipoPersona))
}
