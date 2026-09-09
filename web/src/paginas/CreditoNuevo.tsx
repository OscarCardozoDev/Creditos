import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { erroresPorCampo, type ErrorApi } from '../api/cliente'
import { crear } from '../api/creditos'
import { simular } from '../api/simulacion'
import {
  FORMAS_PAGO,
  PRODUCTOS,
  TIPOS_PERSONA,
  productosDe,
  type CrearCredito,
  type Credito,
  type FormaPago,
  type Simulacion,
  type TipoCredito,
  type TipoPersona,
} from '../api/tipos'
import { Encabezado } from '../componentes/Armazon'
import { ErrorEnLinea } from '../componentes/estados'
import { pesosExactos, tasa } from '../componentes/formato'
import { esAsociado, useUsuario } from '../componentes/sesion'
import { Boton, Campo, Seccion } from '../componentes/ui'

/** Registro de una solicitud, con la cuota estimada visible antes de confirmar. */
export function CreditoNuevo() {
  const navegar = useNavigate()
  const cache = useQueryClient()
  const usuario = useUsuario()

  const [identificacion, setIdentificacion] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCredito>('LIBRE_INVERSION')
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>('PERSONA_NATURAL')
  const [formaPago, setFormaPago] = useState<FormaPago>('NOMINA')
  const [valor, setValor] = useState('15000000')
  const [cuotas, setCuotas] = useState('36')

  // Un asociado solo puede pedir para sí mismo: el servidor toma el deudor de la sesión.
  const paraSiMismo = esAsociado(usuario.rol)
  // El catálogo depende del perfil del deudor: el crédito comercial no se otorga a una persona
  // natural, así que ni siquiera se ofrece. El servidor lo vuelve a exigir con un 422.
  const perfil = paraSiMismo ? usuario.tipoPersona : tipoPersona
  const disponibles = productosDe(perfil)
  // Derivado, no un efecto: al cambiar de perfil el producto elegido puede dejar de existir.
  const tipoElegido = disponibles.includes(tipo) ? tipo : disponibles[0]
  const producto = PRODUCTOS[tipoElegido]
  const valorNum = Number(valor) || 0
  const cuotasNum = Number(cuotas) || 0
  const parametrosCompletos = valorNum > 0 && cuotasNum > 0

  // Espera de 300 ms sobre los campos que alimentan la simulación: una petición por pausa
  // de escritura, no una por tecla.
  const [tardio, setTardio] = useState({ tipo: tipoElegido, valorNum, cuotasNum })
  useEffect(() => {
    const t = setTimeout(() => setTardio({ tipo: tipoElegido, valorNum, cuotasNum }), 300)
    return () => clearTimeout(t)
  }, [tipoElegido, valorNum, cuotasNum])

  const simulacion = useQuery<Simulacion, ErrorApi>({
    queryKey: ['simulacion', tardio],
    queryFn: () =>
      simular({
        tipoCredito: tardio.tipo,
        valorSolicitado: tardio.valorNum,
        numeroCuotas: tardio.cuotasNum,
      }),
    enabled: tardio.valorNum > 0 && tardio.cuotasNum > 0,
    // Cada pausa de escritura estrena clave: sin esto el panel entero vuelve al esqueleto y
    // parpadea en blanco entre una simulación y la siguiente.
    placeholderData: (anterior) => anterior,
  })

  const registro = useMutation<Credito, ErrorApi, CrearCredito>({
    mutationFn: crear,
    onSuccess: (credito) => {
      // El listado y el tablero quedaron obsoletos con la solicitud nueva.
      void cache.invalidateQueries({ queryKey: ['creditos'] })
      navegar(`/creditos/${credito.id}`)
    },
  })

  const porCampo = erroresPorCampo(registro.error)

  /** Envía la solicitud con los datos del formulario. */
  function enviar(e: FormEvent) {
    e.preventDefault()
    registro.mutate({
      ...(paraSiMismo ? {} : { identificacionAsociado: identificacion, nombreAsociado: nombre, tipoPersona }),
      tipoCredito: tipoElegido,
      valorSolicitado: valorNum,
      numeroCuotas: cuotasNum,
      formaPago,
    })
  }

  // Primeros tres periodos y el último: basta para que se vea la forma de la amortización.
  const plan =
    simulacion.data?.tabla.filter(
      (f) => f.numeroCuota <= 3 || f.numeroCuota === simulacion.data!.numeroCuotas,
    ) ?? []

  return (
    <>
      <Encabezado
        antetitulo="[ /creditos/nuevo ] Registro de solicitud"
        titulo="Nueva solicitud"
        meta={['post /api/simulacion · post /api/creditos', 'la tasa la fija la política del producto']}
      />

      <div className="flex flex-1 gap-0.5 bg-tinta">
        <form onSubmit={enviar} className="flex w-[60%] flex-col gap-7 bg-papel px-8 py-7">
          <Seccion
            numero="01"
            titulo="Asociado"
            nota={paraSiMismo ? 'el deudor sale de tu sesión' : 'find-or-create por identificación'}
          >
            {paraSiMismo ? (
              <p className="border-2 border-tinta bg-hundido px-4 py-4 text-[11px] uppercase tracking-[0.04em] text-apagada">
                La solicitud se registra a nombre de {usuario.nombre}. Un asociado no puede pedir
                un crédito para otra persona.
              </p>
            ) : (
            <div className="flex gap-4">
              <Campo
                etiqueta="Identificación"
                valor={identificacion}
                onChange={setIdentificacion}
                pie={
                  porCampo.identificacionAsociado ??
                  'Se resuelve el usuario dentro de la transacción'
                }
                error={Boolean(porCampo.identificacionAsociado)}
              />
              <Campo
                etiqueta="Nombre del asociado"
                valor={nombre}
                onChange={setNombre}
                pie={porCampo.nombreAsociado ?? 'No sobrescribe el nombre si el usuario ya existe'}
                error={Boolean(porCampo.nombreAsociado)}
              />
              <Campo
                etiqueta="Tipo de persona"
                valor={tipoPersona}
                onChange={(v) => setTipoPersona(v as TipoPersona)}
                opciones={TIPOS_PERSONA}
                pie={porCampo.tipoPersona ?? 'Decide qué productos se le pueden ofrecer'}
                error={Boolean(porCampo.tipoPersona)}
              />
            </div>
            )}
          </Seccion>

          <Seccion numero="02" titulo="Producto" nota="compatibilidad tipo ↔ perfil · 422">
            <div className="flex gap-4">
              <Campo
                etiqueta="Tipo de crédito"
                valor={tipoElegido}
                onChange={(v) => setTipo(v as TipoCredito)}
                opciones={disponibles}
                pie={`Sistema ${producto.sistema} · hasta ${producto.cuotasMaximas} cuotas`}
              />
              <Campo
                etiqueta="Forma de pago"
                valor={formaPago}
                onChange={(v) => setFormaPago(v as FormaPago)}
                opciones={FORMAS_PAGO}
                pie={porCampo.formaPago ?? 'Libranza exige nómina'}
                error={Boolean(porCampo.formaPago)}
              />
            </div>
          </Seccion>

          <Seccion numero="03" titulo="Condiciones" nota="valor > 0 · tasa ≥ 0 · cuotas > 0">
            <div className="flex gap-4">
              <Campo
                etiqueta="Valor solicitado"
                valor={valor}
                onChange={setValor}
                tipo="number"
                pie={porCampo.valorSolicitado ?? 'decimal(18,2) · COP'}
                error={Boolean(porCampo.valorSolicitado)}
              />
              <Campo
                etiqueta="Número de cuotas"
                valor={cuotas}
                onChange={setCuotas}
                tipo="number"
                pie={porCampo.numeroCuotas ?? `Rango del producto: 1 – ${producto.cuotasMaximas}`}
                error={Boolean(porCampo.numeroCuotas)}
              />
              <Campo
                etiqueta="Tasa de interés (E.A.)"
                valor={`${producto.tasaEA.toFixed(1)} %`}
                lectura
                marca="[ política ]"
                pie={
                  esAsociado(usuario.rol)
                    ? 'Solo lectura: la tasa es política de la entidad'
                    : `Banda del producto: ${producto.bandaEA[0]} – ${producto.bandaEA[1]} % E.A.`
                }
              />
            </div>
          </Seccion>

          <Seccion numero="04" titulo="Envío" nota="el botón se bloquea mientras la petición viaja">
            <div className="flex flex-col gap-4">
              {registro.isError && <ErrorEnLinea error={registro.error} />}
              <div className="flex gap-3">
                <Boton
                  type="submit"
                  flecha
                  className="flex-1"
                  disabled={
                    registro.isPending ||
                    !parametrosCompletos ||
                    (!paraSiMismo && (!identificacion || !nombre))
                  }
                >
                  {registro.isPending ? 'Registrando…' : 'Registrar solicitud'}
                </Boton>
                <Boton type="button" variante="secundario" onClick={() => navegar('/creditos')}>
                  Cancelar
                </Boton>
              </div>
            </div>
          </Seccion>
        </form>

        {/* Panel de simulación: el solicitante ve a qué se compromete antes de confirmarlo. */}
        <aside className="flex flex-1 flex-col bg-tinta text-papel">
          <div className="flex items-center justify-between bg-rojo px-6 py-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em]">[ Simulación ]</h2>
            <span className="text-[10px] uppercase tracking-[0.08em]">No persiste</span>
          </div>

          {!parametrosCompletos ? (
            <p className="px-6 py-8 text-[11px] uppercase tracking-[0.06em] text-tenue">
              Completa valor y número de cuotas para ver la cuota estimada.
            </p>
          ) : simulacion.isPending ? (
            <div className="flex flex-col gap-3 px-6 py-8">
              <div className="h-3 w-40 animate-pulse bg-[#2a2a28]" />
              <div className="h-12 w-72 animate-pulse bg-[#2a2a28]" />
              <div className="h-3 w-56 animate-pulse bg-[#2a2a28]" />
            </div>
          ) : simulacion.isError ? (
            <div className="px-6 py-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rojo">
                {simulacion.error.estado} · {simulacion.error.codigo.toLowerCase()}
              </p>
              <p className="mt-2 text-[11px] tracking-[0.02em] text-tenue">
                {simulacion.error.message}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 px-6 pb-6 pt-6.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tenue">
                  {simulacion.data.sistema === 'FRANCES'
                    ? 'Cuota mensual estimada'
                    : 'Primera cuota estimada'}
                </p>
                <p className="cifra text-[54px]">{pesosExactos(simulacion.data.cuotaMensual)}</p>
                <p className="text-[11px] uppercase tracking-[0.06em] text-tenue">
                  Sistema{' '}
                  {simulacion.data.sistema === 'FRANCES'
                    ? 'francés · cuota fija'
                    : 'alemán · cuota decreciente'}{' '}
                  · {simulacion.data.numeroCuotas} periodos
                </p>
              </div>

              <Dato rotulo="Tasa mensual vencida" valor={tasa(simulacion.data.tasaInteres)} />
              <Dato
                rotulo="Última cuota"
                valor={pesosExactos(
                  simulacion.data.tabla[simulacion.data.tabla.length - 1].valorCuota,
                )}
              />
              <Dato rotulo="Total a pagar" valor={pesosExactos(simulacion.data.totalPagado)} />
              <Dato
                rotulo="Total intereses"
                valor={pesosExactos(simulacion.data.totalIntereses)}
                destacado
              />

              <div className="flex flex-col pt-5">
                <p className="px-6 text-[11px] font-bold uppercase tracking-[0.10em]">
                  [ Plan de amortización — primeros periodos ]
                </p>
                <table className="mt-3 w-full text-left">
                  <thead>
                    <tr className="bg-[#1c1c1a] text-[11px] font-bold uppercase tracking-[0.08em] text-tenue">
                      <th className="w-12 py-2.5 pl-6 font-bold">#</th>
                      <th className="py-2.5 font-bold">Cuota</th>
                      <th className="py-2.5 font-bold">Interés</th>
                      <th className="py-2.5 font-bold">Capital</th>
                      <th className="py-2.5 pr-6 font-bold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((f, i) => (
                      <Fragment key={f.numeroCuota}>
                        {i === plan.length - 1 && simulacion.data.numeroCuotas > 4 && (
                          <tr className="text-[11px] text-tenue">
                            <td className="py-2 pl-6">…</td>
                            <td colSpan={4}>…</td>
                          </tr>
                        )}
                        <tr className="text-[11px] tracking-[0.02em]">
                          <td className="py-2 pl-6 text-rojo">
                            {String(f.numeroCuota).padStart(2, '0')}
                          </td>
                          <td className="py-2">{pesosExactos(f.valorCuota)}</td>
                          <td className="py-2">{pesosExactos(f.abonoInteres)}</td>
                          <td className="py-2">{pesosExactos(f.abonoCapital)}</td>
                          <td className="py-2 pr-6">{pesosExactos(f.saldoPosterior)}</td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="px-6 pb-6 pt-5 text-[10px] uppercase leading-[1.7] tracking-[0.04em] text-tenue">
                La última cuota absorbe el residuo del redondeo: suma(capital) = P y saldo final =
                0, exactos.
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  )
}

/** Fila de dato del panel de simulación: rótulo a la izquierda, valor a la derecha. */
function Dato({ rotulo, valor, destacado }: { rotulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-[#2a2a28] px-6 py-3">
      <span className="text-[11px] uppercase tracking-[0.06em] text-tenue">{rotulo}</span>
      <span className={`text-xs font-bold tracking-[0.02em] ${destacado ? 'text-rojo' : ''}`}>
        {valor}
      </span>
    </div>
  )
}
