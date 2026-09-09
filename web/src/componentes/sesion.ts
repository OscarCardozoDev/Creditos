import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { usuarioActual } from '../api/auth'
import { ErrorApi } from '../api/cliente'
import type { Rol, UsuarioSesion } from '../api/tipos'

export const CLAVE_SESION = ['sesion'] as const

/**
 * Resuelve quién es el usuario de la sesión.
 * No hay estado global que mantener: la cookie la administra el navegador y la identidad
 * se consulta al servidor, que es la única fuente que puede responderla.
 */
export function useSesion(): UseQueryResult<UsuarioSesion, ErrorApi> {
  return useQuery<UsuarioSesion, ErrorApi>({
    queryKey: CLAVE_SESION,
    queryFn: usuarioActual,
    // Sin sesión la respuesta es 401 y reintentar no la va a crear.
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

/** Devuelve el usuario de una pantalla que ya está detrás de la guardia de sesión. */
export function useUsuario(): UsuarioSesion {
  const { data } = useSesion()
  if (!data) throw new Error('useUsuario fuera de una ruta protegida')
  return data
}

/** Vacía la caché de consultas: se llama al cerrar sesión, para no dejar datos del anterior. */
export function useOlvidarSesion(): () => void {
  const cliente = useQueryClient()
  return () => cliente.clear()
}

/** Indica si el rol solo alcanza sus propios créditos. */
export const esAsociado = (rol: Rol) => rol === 'ASOCIADO'

/** Indica si el rol puede cambiar el estado de un crédito y editar sus condiciones. */
export const puedeGestionar = (rol: Rol) => rol === 'ADMIN' || rol === 'ANALISTA'

/** Indica si el rol puede borrar lógicamente un crédito. */
export const puedeBorrar = (rol: Rol) => rol === 'ADMIN'
