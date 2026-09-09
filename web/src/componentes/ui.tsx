import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Estado } from '../api/tipos'

const COLOR_ESTADO: Record<Estado, string> = {
  SOLICITADO: 'bg-solicitado',
  EN_ESTUDIO: 'bg-en-estudio',
  APROBADO: 'bg-aprobado',
  DESEMBOLSADO: 'bg-desembolsado',
  RECHAZADO: 'bg-rechazado',
  CANCELADO: 'bg-cancelado',
}

/** Etiqueta plana del estado del crédito, en su color de la paleta. */
export function EtiquetaEstado({ estado, grande }: { estado: Estado; grande?: boolean }) {
  return (
    <span
      className={`${COLOR_ESTADO[estado]} inline-block font-bold uppercase text-papel ${
        grande ? 'px-3 py-2 text-xs tracking-[0.10em]' : 'px-2 py-1 text-[10px] tracking-[0.08em]'
      }`}
    >
      {estado}
    </span>
  )
}

type VarianteBoton = 'primario' | 'secundario' | 'peligro'

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-tinta text-papel',
  secundario: 'border-2 border-tinta text-tinta',
  peligro: 'border-2 border-rojo text-rojo',
}

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton
  flecha?: boolean
}

/** Botón del sistema: sin radio, mono en mayúsculas, con `>>>` opcional a la derecha. */
export function Boton({
  variante = 'primario',
  flecha,
  children,
  className = '',
  ...props
}: PropsBoton) {
  return (
    <button
      {...props}
      className={`${VARIANTES[variante]} ${className} flex items-center justify-between gap-4 px-6 py-4 text-xs font-bold uppercase tracking-[0.10em] disabled:opacity-40 ${
        props.disabled ? '' : 'cursor-pointer'
      }`}
    >
      <span>{children}</span>
      {flecha && <span className={variante === 'primario' ? 'text-rojo' : ''}>&gt;&gt;&gt;</span>}
    </button>
  )
}

/** Encabezado de sección numerada: rótulo entre corchetes y nota a la derecha. */
export function Seccion({
  numero,
  titulo,
  nota,
  children,
}: {
  numero: string
  titulo: string
  nota?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between border-b-2 border-tinta pb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em]">
          [ {numero} ] {titulo}
        </h2>
        {nota && <span className="text-[10px] uppercase tracking-[0.04em] text-tenue">{nota}</span>}
      </header>
      {children}
    </section>
  )
}

/** Campo de formulario con etiqueta asociada, caja de borde duro y pie de ayuda. */
export function Campo({
  etiqueta,
  valor,
  onChange,
  pie,
  marca,
  lectura,
  tipo = 'text',
  opciones,
  error,
}: {
  etiqueta: string
  valor: string
  onChange?: (v: string) => void
  pie?: string
  marca?: string
  lectura?: boolean
  tipo?: string
  opciones?: readonly string[]
  /** Marca el campo en rojo: el mensaje del 400 se pinta en el pie, no en un aviso genérico. */
  error?: boolean
}) {
  const id = `campo-${etiqueta.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-1 flex-col gap-2">
      <label htmlFor={id} className="rotulo">
        {etiqueta}
      </label>
      <div
        className={`flex items-center justify-between gap-3 border-2 px-4 py-4 ${
          error ? 'border-rojo' : 'border-tinta'
        } ${lectura ? 'bg-hundido' : 'bg-papel'}`}
      >
        {opciones ? (
          <select
            id={id}
            value={valor}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full appearance-none bg-transparent text-[13px] font-medium outline-none"
          >
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={tipo}
            value={valor}
            readOnly={lectura}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full bg-transparent text-[13px] font-medium outline-none ${
              lectura ? 'text-apagada' : ''
            }`}
          />
        )}
        {marca && (
          <span
            className={`shrink-0 whitespace-nowrap text-[11px] font-bold ${
              lectura ? 'text-tenue' : 'text-rojo'
            }`}
          >
            {marca}
          </span>
        )}
      </div>
      {pie && (
        <p className={`text-[10px] tracking-[0.04em] ${error ? 'text-rojo' : 'uppercase text-tenue'}`}>
          {pie}
        </p>
      )}
    </div>
  )
}

/**
 * Rejilla de líneas capilares: el fondo negro se ve por las separaciones de 2 px
 * y produce divisores perfectos sin declarar un borde por tarjeta.
 */
export function Rejilla({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex gap-0.5 bg-tinta p-0.5 ${className}`}>{children}</div>
}

/** Aviso de error con el código del catálogo y su mensaje legible. */
export function Aviso({
  codigo,
  mensaje,
  children,
}: {
  codigo: string
  mensaje: string
  children?: ReactNode
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 border-2 border-rojo bg-hundido px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rojo">{codigo}</p>
      <p className="text-[11px] tracking-[0.04em] text-apagada">{mensaje}</p>
      {children}
    </div>
  )
}
