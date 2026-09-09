import type { ReactNode } from 'react'
import { ErrorApi, ErrorRed } from '../api/cliente'
import { Boton } from './ui'

/**
 * Los tres estados que contempla cada pantalla, según `modulos/06_frontend.md §5`.
 * Su ausencia es lo primero que se nota al usar la aplicación.
 */

/** Esqueleto con la forma del contenido real: evita el salto de layout al llegar los datos. */
export function Esqueleto({ filas = 6, anchos }: { filas?: number; anchos?: number[] }) {
  const columnas = anchos ?? [150, 270, 150, 165, 145, 130]
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col">
      <span className="sr-only">Cargando…</span>
      <div className="h-10 bg-tinta" />
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex items-center gap-8 border-b border-tenue px-8 py-5">
          {columnas.map((ancho, c) => (
            <div key={c} className="h-3.5 animate-pulse bg-hundido" style={{ width: ancho }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Bloques rectangulares para las zonas que no son tabla, como las tarjetas del tablero. */
export function EsqueletoBloques({ cuantos, alto }: { cuantos: number; alto: number }) {
  return (
    <div aria-busy="true" className="flex gap-0.5 bg-tinta p-0.5">
      {Array.from({ length: cuantos }, (_, i) => (
        <div key={i} className="flex-1 animate-pulse bg-hundido" style={{ height: alto }} />
      ))}
    </div>
  )
}

/** Pantalla vacía: dice qué se buscó y ofrece la salida, nunca un hueco en blanco. */
export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 border-2 border-tinta px-8 py-16">
        <p className="cifra text-[90px] text-tenue">///</p>
        <p className="text-center text-[13px] uppercase tracking-[0.06em]">{titulo}</p>
        {detalle && (
          <p className="text-center text-[11px] uppercase tracking-[0.04em] text-apagada">
            {detalle}
          </p>
        )}
        {accion}
      </div>
    </div>
  )
}

/** Traduce el error de la API a lo que el usuario necesita leer, según §5 del doc. */
function mensajeDe(error: unknown): { codigo: string; texto: string; requestId?: string } {
  if (error instanceof ErrorRed) {
    return { codigo: 'sin conexión', texto: 'No se pudo contactar el servidor.' }
  }
  if (!(error instanceof ErrorApi)) {
    return { codigo: 'error_interno', texto: 'Ocurrió un error inesperado.' }
  }
  const textos: Partial<Record<string, string>> = {
    SIN_PERMISO: 'No tienes permisos para esta acción.',
    CREDITO_NOT_FOUND: 'El crédito no existe o fue borrado.',
    CONCURRENCIA_CONFLICTO: 'Otro usuario modificó este crédito. Recarga para ver la versión vigente.',
    DEMASIADAS_PETICIONES: 'Demasiadas peticiones. Espera un momento.',
    ERROR_INTERNO: 'Ocurrió un error inesperado.',
  }
  return {
    codigo: `${error.estado} · ${error.codigo.toLowerCase()}`,
    texto: textos[error.codigo] ?? error.message,
    // Mostrar el requestId permite reportar el problema con un dato que lleva a la traza.
    requestId: error.codigo === 'ERROR_INTERNO' ? error.requestId : undefined,
  }
}

/** Error de pantalla completa, con el código del catálogo y un botón de reintentar. */
export function ErrorPantalla({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  const { codigo, texto, requestId } = mensajeDe(error)
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16">
      <div
        role="alert"
        className="flex w-full max-w-xl flex-col gap-3 border-2 border-rojo bg-hundido px-6 py-6"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rojo">{codigo}</p>
        <p className="text-[13px]">{texto}</p>
        {requestId && (
          <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">
            requestId: {requestId}
          </p>
        )}
        {reintentar && (
          <Boton variante="secundario" className="self-start" onClick={reintentar}>
            Reintentar
          </Boton>
        )}
      </div>
    </div>
  )
}

/** Aviso en línea para el error de una acción, sin sacar al usuario de la pantalla. */
export function ErrorEnLinea({ error }: { error: unknown }) {
  const { codigo, texto, requestId } = mensajeDe(error)
  return (
    <div role="alert" className="flex flex-col gap-2 border-2 border-rojo bg-hundido px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rojo">{codigo}</p>
      <p className="text-[11px] tracking-[0.04em] text-apagada">{texto}</p>
      {requestId && (
        <p className="text-[10px] uppercase tracking-[0.04em] text-tenue">requestId: {requestId}</p>
      )}
    </div>
  )
}

