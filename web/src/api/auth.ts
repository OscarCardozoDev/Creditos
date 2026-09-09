import { peticion } from './cliente'
import type { SesionActiva, UsuarioSesion } from './tipos'

/**
 * Autentica y deja la sesión abierta en las cookies.
 * No devuelve token: la cookie `__Host-` es HttpOnly y el navegador la administra solo.
 */
export function iniciarSesion(correo: string, password: string): Promise<{ expiraEn: string }> {
  return peticion('/auth/login', { metodo: 'POST', cuerpo: { correo, password } })
}

/** Revoca la sesión actual en el servidor y borra sus cookies del navegador. */
export function cerrarSesion(): Promise<void> {
  return peticion('/auth/logout', { metodo: 'POST' })
}

/** Devuelve quién es el usuario de la sesión en curso, o falla con 401 si no hay ninguna. */
export function usuarioActual(): Promise<UsuarioSesion> {
  return peticion('/auth/yo')
}

/** Lista las sesiones vivas del usuario, marcando cuál es la de este navegador. */
export function listarSesiones(): Promise<SesionActiva[]> {
  return peticion('/auth/sesiones')
}

/** Cierra una sesión concreta del propio usuario, por ejemplo la de otro dispositivo. */
export function cerrarSesionPorId(id: string): Promise<void> {
  return peticion(`/auth/sesiones/${encodeURIComponent(id)}`, { metodo: 'DELETE' })
}
