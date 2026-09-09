import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { erroresPorCampo, type ErrorApi } from '../api/cliente'
import { crear, listar } from '../api/usuarios'
import {
  LARGO_MINIMO_PASSWORD,
  ROLES,
  ROLES_CREABLES,
  ROLES_QUE_OPERAN,
  TIPOS_PERSONA,
  type CrearUsuario,
  type FiltrosUsuarios,
  type Meta,
  type Rol,
  type TipoPersona,
  type Usuario,
} from '../api/tipos'
import { Contenido, Encabezado } from '../componentes/Armazon'
import { ErrorEnLinea, ErrorPantalla, Esqueleto, Vacio } from '../componentes/estados'
import { fechaCorta } from '../componentes/formato'
import { puedeGestionar, useUsuario } from '../componentes/sesion'
import { Boton, Campo, Seccion } from '../componentes/ui'

const VACIO: CrearUsuario = {
  identificacion: '',
  nombreRazonSocial: '',
  tipoPersona: 'PERSONA_NATURAL',
  tipoUsuario: 'ASOCIADO',
  correo: '',
  password: '',
}

/**
 * Alta y consulta de usuarios. No hay registro público: las credenciales de una entidad
 * financiera las crea un administrador, y esta es la pantalla donde lo hace.
 */
export function Usuarios() {
  const sesion = useUsuario()
  const cache = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState<CrearUsuario>(VACIO)
  const [abierto, setAbierto] = useState(false)

  const filtros: FiltrosUsuarios = {
    page: Number(params.get('page') ?? 1),
    limit: 20,
    q: params.get('q') || undefined,
    tipoUsuario: (params.get('rol') as Rol) || undefined,
    sort: params.get('sort') ?? 'creadoEn:desc',
  }

  const consulta = useQuery<{ data: Usuario[]; meta: Meta }, ErrorApi>({
    queryKey: ['usuarios', filtros],
    queryFn: () => listar(filtros),
    placeholderData: keepPreviousData,
  })

  const alta = useMutation<Usuario, ErrorApi, CrearUsuario>({
    mutationFn: crear,
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['usuarios'] })
      setForm(VACIO)
      setAbierto(false)
    },
  })

  const porCampo = erroresPorCampo(alta.error)
  // Quien opera el sistema necesita credenciales; un asociado puede existir solo como deudor.
  const exigeCredenciales = ROLES_QUE_OPERAN.includes(form.tipoUsuario)
  const claveCorta = (form.password ?? '').length > 0 && (form.password ?? '').length < LARGO_MINIMO_PASSWORD

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

  // Búsqueda con espera de 300 ms, igual que en el listado de créditos.
  const [texto, setTexto] = useState(filtros.q ?? '')
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtros.q ?? '') !== texto) aplicar({ q: texto || undefined })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  /** Envía el alta, omitiendo las credenciales vacías para que el servidor no las reciba. */
  function enviar(e: FormEvent) {
    e.preventDefault()
    const { correo, password, ...resto } = form
    alta.mutate(correo && password ? { ...resto, correo, password } : resto)
  }

  const puedeEnviar =
    form.identificacion.length >= 5 &&
    form.nombreRazonSocial.length >= 3 &&
    !claveCorta &&
    Boolean(form.correo) === Boolean(form.password) &&
    (!exigeCredenciales || Boolean(form.correo && form.password))

  if (!puedeGestionar(sesion.rol)) {
    return (
      <Vacio
        titulo="No tienes permisos para esta pantalla"
        detalle="El alta de usuarios la hace un administrador o un analista"
      />
    )
  }

  return (
    <>
      <Encabezado
        antetitulo="[ /usuarios ] Alta y consulta"
        titulo="Usuarios"
        meta={['post /api/usuarios · get /api/usuarios', 'no hay registro público: las crea un administrador']}
      />

      <div className="flex shrink-0 items-center gap-3 border-b-2 border-tinta bg-hundido px-8 py-3">
        <label htmlFor="q" className="rotulo text-tenue">
          Buscar
        </label>
        <input
          id="q"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Identificación o nombre"
          className="flex-1 border-2 border-tinta bg-papel px-3 py-2 text-xs outline-none"
        />
        <select
          aria-label="Filtrar por rol"
          value={filtros.tipoUsuario ?? ''}
          onChange={(e) => aplicar({ rol: e.target.value || undefined })}
          className="cursor-pointer border-2 border-tinta bg-papel px-3 py-2 text-xs font-medium outline-none"
        >
          <option value="">TODOS LOS ROLES</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Boton flecha={!abierto} onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Cerrar formulario' : 'Registrar usuario'}
        </Boton>
      </div>

      {abierto && (
        <form onSubmit={enviar} className="flex shrink-0 flex-col gap-6 border-b-2 border-tinta px-8 py-6">
          <Seccion numero="01" titulo="Identidad" nota="la identificación no cambia después">
            <div className="flex gap-4">
              <Campo
                etiqueta="Identificación"
                valor={form.identificacion}
                onChange={(v) => setForm({ ...form, identificacion: v })}
                pie={porCampo.identificacion ?? 'Entre 5 y 20 caracteres'}
                error={Boolean(porCampo.identificacion)}
              />
              <Campo
                etiqueta="Nombre o razón social"
                valor={form.nombreRazonSocial}
                onChange={(v) => setForm({ ...form, nombreRazonSocial: v })}
                pie={porCampo.nombreRazonSocial ?? 'Entre 3 y 150 caracteres'}
                error={Boolean(porCampo.nombreRazonSocial)}
              />
            </div>
          </Seccion>

          <Seccion numero="02" titulo="Perfil" nota="el ADMIN se aprovisiona con la carga inicial">
            <div className="flex gap-4">
              <Campo
                etiqueta="Rol"
                valor={form.tipoUsuario}
                onChange={(v) => setForm({ ...form, tipoUsuario: v as Rol })}
                opciones={ROLES_CREABLES}
                pie={
                  exigeCredenciales
                    ? 'Este rol opera el sistema: exige correo y contraseña'
                    : 'Puede existir solo como deudor, sin acceso'
                }
              />
              <Campo
                etiqueta="Tipo de persona"
                valor={form.tipoPersona}
                onChange={(v) => setForm({ ...form, tipoPersona: v as TipoPersona })}
                opciones={TIPOS_PERSONA}
                pie={porCampo.tipoPersona ?? 'Solo el ASOCIADO puede ser persona jurídica'}
                error={Boolean(porCampo.tipoPersona)}
              />
            </div>
          </Seccion>

          <Seccion
            numero="03"
            titulo="Acceso"
            nota={exigeCredenciales ? 'obligatorio para este rol' : 'opcional · ambos o ninguno'}
          >
            <div className="flex gap-4">
              <Campo
                etiqueta="Correo"
                valor={form.correo ?? ''}
                onChange={(v) => setForm({ ...form, correo: v })}
                tipo="email"
                pie={porCampo.correo ?? 'Con el que iniciará sesión'}
                error={Boolean(porCampo.correo)}
              />
              <Campo
                etiqueta="Contraseña"
                valor={form.password ?? ''}
                onChange={(v) => setForm({ ...form, password: v })}
                tipo="password"
                pie={
                  porCampo.password ??
                  (claveCorta
                    ? `Mínimo ${LARGO_MINIMO_PASSWORD} caracteres`
                    : `Mínimo ${LARGO_MINIMO_PASSWORD} caracteres · se guarda con argon2id, nunca en claro`)
                }
                error={Boolean(porCampo.password) || claveCorta}
              />
            </div>
          </Seccion>

          {alta.isError && <ErrorEnLinea error={alta.error} />}

          <div className="flex gap-3">
            <Boton type="submit" flecha className="flex-1" disabled={alta.isPending || !puedeEnviar}>
              {alta.isPending ? 'Registrando…' : 'Registrar usuario'}
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => {
                setForm(VACIO)
                setAbierto(false)
              }}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {consulta.isPending ? (
        <Esqueleto filas={8} anchos={[180, 280, 180, 160, 120]} />
      ) : consulta.isError ? (
        <ErrorPantalla error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : consulta.data.data.length === 0 ? (
        <Vacio
          titulo="No hay usuarios con estos filtros"
          detalle={params.toString() || 'sin filtros aplicados'}
          accion={
            <Boton flecha onClick={() => setParams(new URLSearchParams())}>
              Limpiar filtros
            </Boton>
          }
        />
      ) : (
        <Contenido className="!gap-0 !py-0">
          <table className="w-full text-left">
            <caption className="sr-only">Usuarios registrados</caption>
            <thead>
              <tr className="bg-tinta text-[10px] font-bold uppercase tracking-[0.10em] text-tenue">
                <th className="w-44 py-3 font-bold">Identificación</th>
                <th className="w-80 py-3 font-bold">Nombre o razón social</th>
                <th className="w-44 py-3 font-bold">Rol</th>
                <th className="w-52 py-3 font-bold">Tipo de persona</th>
                <th className="w-28 py-3 font-bold">Activo</th>
                <th className="py-3 font-bold">Alta</th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.data.map((u, i) => (
                <tr
                  key={u.usuarioId}
                  className={i < consulta.data.data.length - 1 ? 'border-b border-tenue' : ''}
                >
                  <td className="py-3.5 text-[11px] font-bold tracking-[0.04em]">
                    {u.identificacion}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {u.nombreRazonSocial}
                  </td>
                  <td className="py-3.5 text-[11px] font-medium tracking-[0.04em]">
                    {u.tipoUsuario}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {u.tipoPersona}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {u.activo ? 'SÍ' : 'NO'}
                  </td>
                  <td className="py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                    {fechaCorta(u.creadoEn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-auto flex items-center justify-between border-2 border-tinta bg-hundido px-6 py-3.5">
            <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">
              {consulta.data.meta.total} usuarios · página {consulta.data.meta.page} de{' '}
              {consulta.data.meta.totalPages}
            </p>
            <div className="flex gap-1.5">
              <Boton
                variante="secundario"
                disabled={consulta.data.meta.page === 1}
                onClick={() => aplicar({ page: String(consulta.data.meta.page - 1) })}
              >
                &lt;&lt;&lt;
              </Boton>
              <Boton
                variante="secundario"
                disabled={consulta.data.meta.page >= consulta.data.meta.totalPages}
                onClick={() => aplicar({ page: String(consulta.data.meta.page + 1) })}
              >
                &gt;&gt;&gt;
              </Boton>
            </div>
          </div>
        </Contenido>
      )}
    </>
  )
}
