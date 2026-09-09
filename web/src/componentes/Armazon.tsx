import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cerrarSesion } from '../api/auth'
import { ErrorPantalla } from './estados'
import { puedeGestionar, useOlvidarSesion, useSesion } from './sesion'

const ENLACES = [
  { a: '/', texto: 'Tablero', exacto: true, soloGestion: false },
  { a: '/creditos', texto: 'Créditos', exacto: false, soloGestion: false },
  { a: '/creditos/nuevo', texto: 'Nueva solicitud', exacto: true, soloGestion: false },
  // El alta de usuarios es tarea de quien opera el sistema, no del asociado.
  { a: '/usuarios', texto: 'Usuarios', exacto: false, soloGestion: true },
]

/**
 * Guardia de sesión y armazón de las pantallas autenticadas.
 * Resuelve la identidad una sola vez y la comparte con toda la aplicación por la caché
 * de consultas; sin sesión válida, manda al acceso conservando el destino.
 */
export function Armazon() {
  const { data: usuario, isPending, isError, error, refetch } = useSesion()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const olvidar = useOlvidarSesion()

  const salir = useMutation({
    mutationFn: cerrarSesion,
    // Aunque el servidor falle, la sesión local se descarta: el usuario pidió salir.
    onSettled: () => {
      olvidar()
      navegar('/login', { replace: true })
    },
  })

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[11px] uppercase tracking-[0.12em] text-apagada">
          Verificando sesión…
        </p>
      </div>
    )
  }

  if (isError) {
    // 401 ya redirige desde el cliente; aquí solo queda el servidor caído o un 5xx.
    if (error.estado === 401) {
      const destino = ubicacion.pathname + ubicacion.search
      return <Navigate to={`/login?volver=${encodeURIComponent(destino)}`} replace />
    }
    return <ErrorPantalla error={error} reintentar={() => void refetch()} />
  }

  // El asociado ve los mismos enlaces de créditos —su listado sale ya recortado por el
  // repositorio, no por ocultarle el menú—, pero no el de usuarios, que no puede usar.
  const enlaces = ENLACES.filter((e) => !e.soloGestion || puedeGestionar(usuario.rol))

  return (
    <div className="flex min-h-screen flex-col">
      {/* Envuelve en dos filas cuando no cabe: por debajo de ~1000 px el nombre del usuario
          se montaba encima del menú. `min-h` conserva la altura exacta cuando sí cabe. */}
      <header className="flex min-h-13 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-tinta px-6 py-2">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
          <span className="font-titulo text-base font-black tracking-[-0.02em] text-papel">
            CRÉDITOS®
          </span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {enlaces.map((e, i) => (
              <span key={e.a} className="flex items-center gap-5">
                {i > 0 && <span className="text-[11px] text-apagada">│</span>}
                <NavLink
                  to={e.a}
                  end={e.exacto}
                  className={({ isActive }) =>
                    `text-[11px] uppercase tracking-[0.10em] ${
                      isActive ? 'font-bold text-papel' : 'text-tenue'
                    }`
                  }
                >
                  {e.texto}
                </NavLink>
              </span>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-papel">
            {usuario.nombre} · {usuario.rol}
          </span>
          <button
            type="button"
            onClick={() => salir.mutate()}
            disabled={salir.isPending}
            className="cursor-pointer border border-apagada px-3 py-1.5 text-[10px] uppercase tracking-[0.10em] text-tenue disabled:opacity-40"
          >
            {salir.isPending ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  )
}

/** Encabezado de pantalla: antetítulo, título en negra y metadatos de la ruta de la API. */
export function Encabezado({
  antetitulo,
  titulo,
  meta,
}: {
  antetitulo: string
  titulo: string
  meta: [string, string]
}) {
  return (
    <div className="flex shrink-0 items-end justify-between border-b-2 border-tinta px-8 pb-6 pt-7">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rojo">{antetitulo}</p>
        <h1 className="cifra text-[56px] uppercase">{titulo}</h1>
      </div>
      <div className="flex flex-col items-end gap-1">
        <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">{meta[0]}</p>
        <p className="text-[11px] uppercase tracking-[0.04em] text-tenue">{meta[1]}</p>
      </div>
    </div>
  )
}

/** Envuelve el contenido de una pantalla con el margen estándar. */
export function Contenido({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`flex flex-1 flex-col gap-6 px-8 py-7 ${className}`}>{children}</main>
}
