import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { iniciarSesion } from '../api/auth'
import { ErrorApi, ErrorRed } from '../api/cliente'
import { Boton } from '../componentes/ui'

const ROLES = [
  ['ADMIN', 'Todo · borrado lógico · revocar sesiones ajenas'],
  ['ANALISTA', 'Crear, consultar, editar y cambiar estado'],
  ['ASOCIADO', 'Solo sus propios créditos · crear su solicitud'],
]

/** Traduce el fallo del acceso a una frase accionable, sin filtrar si el correo existe. */
function mensajeDeAcceso(error: unknown): string {
  if (error instanceof ErrorRed) return 'No se pudo contactar el servidor.'
  if (!(error instanceof ErrorApi)) return 'Ocurrió un error inesperado.'
  switch (error.codigo) {
    case 'CREDENCIALES_INVALIDAS':
      return 'CREDENCIALES_INVALIDAS — correo o contraseña incorrectos'
    case 'USUARIO_INACTIVO':
      return 'USUARIO_INACTIVO — la cuenta está desactivada'
    case 'DEMASIADAS_PETICIONES':
      return 'DEMASIADAS_PETICIONES — 5 intentos por minuto; espera un momento'
    case 'VALIDATION_ERROR':
      return `VALIDATION_ERROR — ${error.message}`
    default:
      return `${error.codigo} — ${error.message}`
  }
}

/** Pantalla de acceso: único punto de entrada, sin registro público. */
export function Login() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const cache = useQueryClient()

  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')

  const acceso = useMutation({
    mutationFn: () => iniciarSesion(correo, clave),
    onSuccess: () => {
      // La sesión anterior en caché ya no vale: el servidor rotó el identificador al autenticar.
      cache.clear()
      navegar(params.get('volver') ?? '/', { replace: true })
    },
  })

  /** Envía las credenciales y entra al tablero, o al destino que el usuario intentaba abrir. */
  function enviar(e: FormEvent) {
    e.preventDefault()
    acceso.mutate()
  }

  const sesionTerminada = params.get('sesion') === 'terminada'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-tinta px-8 py-3.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-papel">
          /// Sistema de créditos — sector financiero solidario
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-tenue">
          Rev 0.1 · Unit / auth-01
        </span>
      </header>

      <div className="flex flex-1 gap-0.5 bg-tinta">
        {/* Panel de marca */}
        <section className="flex w-[60%] flex-col justify-between bg-papel px-16 pb-10 pt-14">
          <div className="flex flex-col">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-rojo">
              [ Acceso restringido ]
            </p>
            <h1 className="cifra text-[clamp(6rem,11vw,11rem)] uppercase">Acceso</h1>
            <div className="h-2.5 w-full bg-rojo" />
            <p className="mt-4 text-[13px] leading-[1.7] tracking-[0.02em] text-apagada">
              Cada sesión queda registrada: identificador, IP, agente y fecha.
              <br />
              El identificador de sesión es opaco y se revoca al instante.
            </p>
          </div>

          <div className="border-2 border-tinta">
            <div className="flex items-center justify-between bg-tinta px-5 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-papel">
                Roles del sistema
              </span>
              <span className="text-[11px] uppercase tracking-[0.04em] text-tenue">
                usuarios.tipo_usuario
              </span>
            </div>
            {ROLES.map(([rol, alcance], i) => (
              <div
                key={rol}
                className={`flex items-center px-5 py-3.5 ${
                  i < ROLES.length - 1 ? 'border-b-2 border-tinta' : ''
                }`}
              >
                <span className="w-40 text-[11px] font-bold uppercase tracking-[0.10em]">{rol}</span>
                <span className="text-[11px] uppercase tracking-[0.04em] text-apagada">
                  {alcance}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-tenue">
            <span>© 2026 · Módulo de créditos®</span>
            <span>argon2id · sha-256 · samesite=strict</span>
          </div>
        </section>

        {/* Panel de formulario */}
        <section className="flex flex-1 flex-col justify-between bg-papel px-12 pb-10 pt-14">
          <form onSubmit={enviar} className="flex flex-col gap-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em]">[ Autenticación ]</p>

            {sesionTerminada && !acceso.isError && (
              <p className="border-2 border-tinta bg-hundido px-4 py-3.5 text-[11px] uppercase tracking-[0.04em] text-apagada">
                Tu sesión terminó. Vuelve a autenticarte.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="correo" className="rotulo">
                  Correo
                </label>
                <span className="text-[11px] uppercase tracking-[0.08em] text-tenue">
                  [ requerido ]
                </span>
              </div>
              <input
                id="correo"
                type="email"
                required
                autoComplete="username"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="border-2 border-tinta bg-hundido px-4 py-4 text-sm font-medium outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="clave" className="rotulo">
                  Contraseña
                </label>
                <span className="text-[11px] uppercase tracking-[0.08em] text-tenue">
                  [ requerido ]
                </span>
              </div>
              <input
                id="clave"
                type="password"
                required
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="border-2 border-tinta bg-hundido px-4 py-4 text-sm font-medium outline-none"
              />
            </div>

            {acceso.isError && (
              <p
                role="alert"
                className="flex items-center gap-3 bg-rojo px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.04em] text-papel"
              >
                <span className="font-bold">!</span>
                {mensajeDeAcceso(acceso.error)}
              </p>
            )}

            <Boton type="submit" flecha disabled={acceso.isPending}>
              {acceso.isPending ? 'Verificando…' : 'Iniciar sesión'}
            </Boton>
          </form>

          <div className="flex flex-col gap-2.5 border-t-2 border-tinta pt-5">
            <p className="text-[11px] uppercase leading-[1.6] tracking-[0.04em] text-apagada">
              No hay registro público. Las credenciales las crea un administrador.
            </p>
            <p className="text-[11px] uppercase tracking-[0.08em] text-tenue">
              5 intentos / min · bloqueo tras 10 fallos
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
