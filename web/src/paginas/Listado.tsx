import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ErrorApi } from '../api/cliente'
import { listar } from '../api/creditos'
import {
  ESTADOS_VIGENTES,
  TIPOS_CREDITO,
  type Credito,
  type Estado,
  type FiltrosCreditos,
  type Meta,
  type TipoCredito,
} from '../api/tipos'
import { Encabezado } from '../componentes/Armazon'
import { ErrorPantalla, Esqueleto, Vacio } from '../componentes/estados'
import { fechaCorta, pesos } from '../componentes/formato'
import { esAsociado, useUsuario } from '../componentes/sesion'
import { Boton, EtiquetaEstado } from '../componentes/ui'

const COLUMNAS: { campo: string; texto: string; ancho: string }[] = [
  { campo: 'numeroCredito', texto: 'N.º crédito', ancho: 'w-40' },
  { campo: 'nombreAsociado', texto: 'Asociado', ancho: 'w-72' },
  { campo: 'valorSolicitado', texto: 'Valor', ancho: 'w-40' },
  { campo: 'tipoCredito', texto: 'Tipo', ancho: 'w-44' },
  { campo: 'estado', texto: 'Estado', ancho: 'w-40' },
  { campo: 'fechaSolicitud', texto: 'Fecha', ancho: 'w-32' },
]

/**
 * Listado con filtros, orden y paginación.
 * Los filtros viven en la URL: el enlace se comparte, la recarga no los pierde
 * y el botón atrás del navegador se comporta como el usuario espera.
 */
export function Listado() {
  const usuario = useUsuario()
  // El recorte por asociado lo impone el repositorio del servidor, no la interfaz.
  const propio = esAsociado(usuario.rol)
  const [params, setParams] = useSearchParams()

  const filtros: FiltrosCreditos = {
    page: Number(params.get('page') ?? 1),
    limit: Math.min(Number(params.get('limit') ?? 20), 100),
    estado: (params.get('estado') as Estado) || undefined,
    tipoCredito: (params.get('tipo') as TipoCredito) || undefined,
    desde: params.get('desde') || undefined,
    hasta: params.get('hasta') || undefined,
    q: params.get('q') || undefined,
    sort: params.get('sort') ?? 'fechaSolicitud:desc',
  }

  const consulta = useQuery<{ data: Credito[]; meta: Meta }, ErrorApi>({
    queryKey: ['creditos', 'listado', filtros],
    queryFn: () => listar(filtros),
    // Conserva la página anterior mientras llega la nueva: evita el parpadeo al paginar.
    placeholderData: keepPreviousData,
  })
  const [campoOrden, direccionOrden] = (filtros.sort ?? '').split(':')

  /** Reescribe la URL con un filtro nuevo y vuelve a la primera página. */
  function aplicar(cambios: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in cambios)) siguiente.delete('page')
    setParams(siguiente)
  }

  /** Invierte la dirección si ya se ordena por esa columna, o la estrena descendente. */
  function ordenarPor(campo: string) {
    const direccion = campoOrden === campo && direccionOrden === 'desc' ? 'asc' : 'desc'
    aplicar({ sort: `${campo}:${direccion}` })
  }

  // Búsqueda con espera de 300 ms: una petición por pausa, no una por tecla.
  const [texto, setTexto] = useState(filtros.q ?? '')
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtros.q ?? '') !== texto) aplicar({ q: texto || undefined })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])


  return (
    <>
      <Encabezado
        antetitulo={propio ? '[ /creditos ] Mis solicitudes' : '[ /creditos ] Bandeja de análisis'}
        titulo={propio ? 'Mis créditos' : 'Créditos'}
        meta={[
          'get /api/creditos?estado=&tipo=&q=&sort=',
          'orden por columna · tope limit=100',
        ]}
      />

      {/* Tira de URL: hace visible que el estado de la pantalla está en la barra de direcciones. */}
      <div className="flex shrink-0 items-center gap-3 border-b-2 border-tinta bg-hundido px-8 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tenue">URL</span>
        <code className="text-[11px] font-medium tracking-[0.02em]">
          /creditos{params.toString() ? `?${params.toString()}` : ''}
        </code>
      </div>

      {propio && (
        <p className="shrink-0 border-b-2 border-tinta bg-hundido px-8 py-2.5 text-[10px] uppercase tracking-[0.06em] text-apagada">
          <span className="font-bold text-rojo">[ Alcance ]</span> Solo tus solicitudes — el
          repositorio impone deudor_id = usuario de la sesión
        </p>
      )}

      <div className="flex shrink-0 flex-col gap-3.5 border-b-2 border-tinta px-8 py-4.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rotulo">Estado</span>
          <BotonFiltro activo={!filtros.estado} onClick={() => aplicar({ estado: undefined })}>
            Todos
          </BotonFiltro>
          {ESTADOS_VIGENTES.map((e) => (
            <BotonFiltro
              key={e}
              activo={filtros.estado === e}
              estado={e}
              onClick={() => aplicar({ estado: filtros.estado === e ? undefined : e })}
            >
              {e}
            </BotonFiltro>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Selector
            rotulo="Tipo"
            valor={filtros.tipoCredito ?? ''}
            opciones={TIPOS_CREDITO}
            onChange={(v) => aplicar({ tipo: v || undefined })}
          />
          <Fecha rotulo="Desde" valor={filtros.desde ?? ''} onChange={(v) => aplicar({ desde: v || undefined })} />
          <Fecha rotulo="Hasta" valor={filtros.hasta ?? ''} onChange={(v) => aplicar({ hasta: v || undefined })} />
          <div className="flex flex-1 items-center gap-3 border-2 border-tinta px-3 py-2.5">
            <label htmlFor="q" className="rotulo text-tenue">
              Buscar
            </label>
            <input
              id="q"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="N.º de crédito o nombre"
              className="w-full bg-transparent text-xs outline-none"
            />
            <span className="text-[10px] uppercase tracking-[0.06em] text-apagada">300 ms</span>
          </div>
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams())}
            className="cursor-pointer bg-tinta px-4 py-3 text-[10px] font-bold uppercase tracking-[0.10em] text-papel"
          >
            Limpiar
          </button>
        </div>
      </div>

      {consulta.isPending ? (
        <Esqueleto filas={8} />
      ) : consulta.isError ? (
        <ErrorPantalla error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : consulta.data.data.length === 0 ? (
        <Vacio
          titulo="No hay créditos con estos filtros"
          detalle={params.toString() || 'sin filtros aplicados'}
          accion={
            <Boton flecha onClick={() => setParams(new URLSearchParams())}>
              Limpiar filtros
            </Boton>
          }
        />
      ) : (
        <Resultados
          data={consulta.data.data}
          meta={consulta.data.meta}
          campoOrden={campoOrden}
          direccionOrden={direccionOrden}
          ordenarPor={ordenarPor}
          aplicar={aplicar}
        />
      )}
    </>
  )
}

/** Tabla de resultados con su cabecera ordenable y el pie de paginación. */
function Resultados({
  data,
  meta,
  campoOrden,
  direccionOrden,
  ordenarPor,
  aplicar,
}: {
  data: Credito[]
  meta: Meta
  campoOrden: string
  direccionOrden: string
  ordenarPor: (campo: string) => void
  aplicar: (cambios: Record<string, string | undefined>) => void
}) {
  const desde = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1
  const hasta = Math.min(meta.page * meta.limit, meta.total)

  return (
        <div className="flex flex-1 flex-col">
          <table className="w-full text-left">
            <caption className="sr-only">Créditos que cumplen los filtros aplicados</caption>
            <thead>
              <tr className="bg-tinta">
                {COLUMNAS.map((col) => (
                  <th key={col.campo} className={`${col.ancho} px-0 py-3 first:pl-8`}>
                    <button
                      type="button"
                      onClick={() => ordenarPor(col.campo)}
                      className={`flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.10em] ${
                        campoOrden === col.campo ? 'text-papel' : 'text-tenue'
                      }`}
                    >
                      {col.texto}
                      {campoOrden === col.campo && (
                        <span className="text-rojo">{direccionOrden === 'desc' ? '▼' : '▲'}</span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="px-8 py-3 text-[10px] font-bold uppercase tracking-[0.10em] text-tenue">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.id} className={i < data.length - 1 ? 'border-b border-tenue' : ''}>
                  <td className="py-3.5 pl-8 text-[11px] font-bold tracking-[0.04em]">
                    {c.numeroCredito}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {c.nombreAsociado}
                  </td>
                  <td className="py-3.5 text-[11px] font-medium tracking-[0.04em] text-apagada">
                    {pesos(c.valorSolicitado)}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {c.tipoCredito}
                  </td>
                  <td className="py-3.5">
                    <EtiquetaEstado estado={c.estado} />
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {fechaCorta(c.fechaSolicitud)}
                  </td>
                  <td className="px-8 py-3.5">
                    <Link
                      to={`/creditos/${c.id}`}
                      className="flex items-center gap-3.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                    >
                      Ver detalle <span className="text-rojo">&gt;&gt;&gt;</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-auto flex items-center justify-between border-2 border-tinta bg-hundido px-8 py-3.5">
            <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">
              {desde}–{hasta} de {meta.total} · meta.totalPages = {meta.totalPages} · limit ={' '}
              {meta.limit} (tope duro 100)
            </p>
            <div className="flex items-center gap-1.5">
              <BotonPagina
                deshabilitado={meta.page === 1}
                onClick={() => aplicar({ page: String(meta.page - 1) })}
              >
                &lt;&lt;&lt;
              </BotonPagina>
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
                <BotonPagina key={p} activo={p === meta.page} onClick={() => aplicar({ page: String(p) })}>
                  {p}
                </BotonPagina>
              ))}
              <BotonPagina
                deshabilitado={meta.page === meta.totalPages}
                onClick={() => aplicar({ page: String(meta.page + 1) })}
              >
                &gt;&gt;&gt;
              </BotonPagina>
            </div>
          </div>
        </div>
  )
}

const PUNTO: Record<Estado, string> = {
  SOLICITADO: 'bg-solicitado',
  EN_ESTUDIO: 'bg-en-estudio',
  APROBADO: 'bg-aprobado',
  DESEMBOLSADO: 'bg-desembolsado',
  RECHAZADO: 'bg-rechazado',
  CANCELADO: 'bg-cancelado',
}

/** Ficha de filtro por estado, con su punto de color y estado activo. */
function BotonFiltro({
  activo,
  estado,
  onClick,
  children,
}: {
  activo: boolean
  estado?: Estado
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] ${
        activo ? 'border-2 border-tinta bg-tinta text-papel' : 'border border-tinta text-tinta'
      }`}
    >
      {estado && (
        <span className={`size-1.5 ${activo ? 'bg-papel' : PUNTO[estado]}`} aria-hidden />
      )}
      {children}
    </button>
  )
}

/** Control desplegable de filtro con su rótulo dentro de la caja. */
function Selector({
  rotulo,
  valor,
  opciones,
  onChange,
}: {
  rotulo: string
  valor: string
  opciones: readonly string[]
  onChange: (v: string) => void
}) {
  const id = `filtro-${rotulo.toLowerCase()}`
  return (
    <div className="flex w-64 items-center gap-3 border-2 border-tinta px-3 py-2.5">
      <label htmlFor={id} className="rotulo text-tenue">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer bg-transparent text-xs font-medium outline-none"
      >
        <option value="">TODOS</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Control de fecha de filtro con su rótulo dentro de la caja. */
function Fecha({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
}) {
  const id = `filtro-${rotulo.toLowerCase()}`
  return (
    <div className="flex w-52 items-center gap-3 border-2 border-tinta px-3 py-2.5">
      <label htmlFor={id} className="rotulo text-tenue">
        {rotulo}
      </label>
      <input
        id={id}
        type="date"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer bg-transparent text-xs font-medium outline-none"
      />
    </div>
  )
}

/** Botón de paginación, cuadrado y sin radio. */
function BotonPagina({
  activo,
  deshabilitado,
  onClick,
  children,
}: {
  activo?: boolean
  deshabilitado?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={onClick}
      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] disabled:opacity-30 ${
        activo ? 'border-2 border-tinta bg-tinta text-papel' : 'border border-tinta text-tinta'
      } ${deshabilitado ? '' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  )
}
