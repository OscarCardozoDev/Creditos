import { peticion, peticionConMeta } from './cliente'
import type { CrearUsuario, FiltrosUsuarios, Meta, Usuario } from './tipos'

/** Registra un usuario y, si se envían credenciales, su acceso al sistema. */
export function crear(datos: CrearUsuario): Promise<Usuario> {
  return peticion('/usuarios', { metodo: 'POST', cuerpo: datos })
}

/** Devuelve la página de usuarios que piden los filtros, con su `meta` de paginación. */
export async function listar(
  filtros: FiltrosUsuarios = {},
): Promise<{ data: Usuario[]; meta: Meta }> {
  const { datos, meta } = await peticionConMeta<Usuario[]>('/usuarios', { consulta: filtros })
  return { data: datos, meta: meta as Meta }
}

/** Cierra todas las sesiones de un usuario. Solo ADMIN. */
export function cerrarSesiones(id: string): Promise<void> {
  return peticion(`/usuarios/${id}/sesiones`, { metodo: 'DELETE' })
}
