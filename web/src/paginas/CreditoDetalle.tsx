import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ErrorApi } from '../api/cliente'
import { cambiarEstado, cuotas, historial, obtener } from '../api/creditos'
import { simular } from '../api/simulacion'
import {
  EXIGEN_OBSERVACION,
  OBSERVACION_MAXIMA,
  OBSERVACION_MINIMA,
  PRODUCTOS,
  type CambiarEstado,
  type Credito,
  type Cuota,
  type EntradaHistorial,
  type Estado,
  type Simulacion,
} from '../api/tipos'
import { Contenido, Encabezado } from '../componentes/Armazon'
import { ErrorEnLinea, ErrorPantalla, Esqueleto, Vacio } from '../componentes/estados'
import { fechaLarga, pesos, pesosExactos, tasa } from '../componentes/formato'
import { puedeGestionar, useUsuario } from '../componentes/sesion'
import { Boton, EtiquetaEstado, Rejilla } from '../componentes/ui'

/** Nombre del botón de cada transición, para no rotularlos "Pasar a X". */
const ACCION: Partial<Record<Estado, string>> = {
  APROBADO: 'Aprobar',
  DESEMBOLSADO: 'Marcar desembolsado',
  RECHAZADO: 'Rechazar',
  CANCELADO: 'Cancelar solicitud',
}

/** Detalle del crédito con su bitácora y las transiciones que permite el backend. */
export function CreditoDetalle() {
  const { id = '' } = useParams()
  const usuario = useUsuario()

  const consulta = useQuery<Credito, ErrorApi>({
    queryKey: ['creditos', 'detalle', id],
    queryFn: () => obtener(id),
  })

  if (consulta.isPending) {
    return (
      <Contenido>
        <Esqueleto filas={7} anchos={[220, 300]} />
      </Contenido>
    )
  }

  if (consulta.isError) {
    if (consulta.error.estado === 404) {
      return (
        <Vacio
          titulo="Crédito no encontrado"
          detalle="Un crédito borrado responde 404, nunca 410"
          accion={
            <Link to="/creditos">
              <Boton flecha>Volver al listado</Boton>
            </Link>
          }
        />
      )
    }
    return <ErrorPantalla error={consulta.error} reintentar={() => void consulta.refetch()} />
  }

  return <Cuerpo credito={consulta.data} puedeCambiar={puedeGestionar(usuario.rol)} />
}

/** Cuerpo del detalle, ya con el crédito resuelto. */
function Cuerpo({ credito, puedeCambiar }: { credito: Credito; puedeCambiar: boolean }) {
  const cache = useQueryClient()
  const [destino, setDestino] = useState<Estado | null>(null)
  const [observacion, setObservacion] = useState('')

  const bitacora = useQuery<EntradaHistorial[], ErrorApi>({
    queryKey: ['creditos', 'historial', credito.id],
    queryFn: () => historial(credito.id),
  })

  const plan = useQuery<Cuota[], ErrorApi>({
    queryKey: ['creditos', 'cuotas', credito.id],
    queryFn: () => cuotas(credito.id),
  })

  const transicion = useMutation<Credito, ErrorApi, CambiarEstado>({
    mutationFn: (datos) => cambiarEstado(credito.id, datos),
    onSuccess: () => {
      // El estado cambió: el detalle, su bitácora, el listado y el tablero quedan obsoletos.
      void cache.invalidateQueries({ queryKey: ['creditos'] })
      setDestino(null)
      setObservacion('')
    },
  })

  const cuotasDelPlan = plan.data ?? []
  // El plan de cuotas nace al aprobar. Hasta entonces los totales salen del mismo motor de
  // amortización, con la tasa pactada del crédito: sumar un plan vacío daría cero, que no es cero.
  const sinPlan = !plan.isPending && cuotasDelPlan.length === 0

  const estimado = useQuery<Simulacion, ErrorApi>({
    queryKey: ['creditos', 'estimado', credito.id, credito.version],
    queryFn: () =>
      simular({
        tipoCredito: credito.tipoCredito,
        valorSolicitado: Number(credito.valorSolicitado),
        numeroCuotas: credito.numeroCuotas,
        tasaInteres: Number(credito.tasaInteres),
      }),
    enabled: sinPlan,
  })

  const sistema = PRODUCTOS[credito.tipoCredito].sistema
  const escrita = observacion.trim()
  const exigeObservacion = destino !== null && EXIGEN_OBSERVACION.includes(destino)
  // El servidor exige 3 caracteres incluso cuando la observación es opcional: escribir "ok"
  // devolvía un 400 sin que nada lo hubiera advertido.
  const observacionInvalida =
    (exigeObservacion || escrita.length > 0) && escrita.length < OBSERVACION_MINIMA

  const totales = cuotasDelPlan.length
    ? {
        pagado: cuotasDelPlan.reduce((s, c) => s + Number(c.valorCuota), 0),
        intereses: cuotasDelPlan.reduce((s, c) => s + Number(c.abonoInteres), 0),
      }
    : estimado.data && { pagado: Number(estimado.data.totalPagado), intereses: Number(estimado.data.totalIntereses) }
  const notaTotales = sinPlan ? 'Estimado · el plan se fija al aprobar' : `COP · ${credito.numeroCuotas} periodos`

  const campos: [string, string][] = [
    ['Asociado', credito.nombreAsociado],
    ['Identificación', credito.identificacionAsociado],
    ['Tipo de crédito', credito.tipoCredito],
    ['Forma de pago', credito.formaPago],
    ['Valor solicitado', pesos(credito.valorSolicitado)],
    ['Número de cuotas', String(credito.numeroCuotas)],
    // El contrato solo trae la tasa mensual pactada; la anual es la de política del producto.
    ['Tasa mensual vencida', tasa(credito.tasaInteres)],
    ['Tasa E.A. de política', `${PRODUCTOS[credito.tipoCredito].tasaEA.toFixed(1)} %`],
    ['Sistema de amortización', sistema],
    ['Fecha de solicitud', fechaLarga(credito.fechaSolicitud)],
  ]

  return (
    <>
      <Encabezado
        antetitulo={`[ /creditos/:id ] ${credito.numeroCredito}`}
        titulo="Detalle"
        meta={['get /api/creditos/:id · get /:id/historial', 'las transiciones válidas las envía el backend']}
      />

      <div className="flex flex-1 gap-0.5 bg-tinta">
        <div className="flex w-[60%] flex-col gap-6 bg-papel px-8 py-7">
          {/* Identidad del crédito */}
          <div className="flex items-start justify-between bg-tinta px-6 py-6">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-[0.08em] text-tenue">
                Número de crédito
              </p>
              <p className="cifra text-[44px] text-papel">{credito.numeroCredito}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-tenue">
                version {credito.version} · se envía en if-match al modificar
              </p>
            </div>
            <EtiquetaEstado estado={credito.estado} grande />
          </div>

          {/* Campos */}
          <dl className="grid grid-cols-2 gap-x-8">
            {campos.map(([rotulo, valor], i) => (
              <div
                key={rotulo}
                className={`flex flex-col gap-1 py-3 ${i < campos.length - 2 ? 'border-b border-tenue' : ''}`}
              >
                <dt className="rotulo">{rotulo}</dt>
                <dd className="text-[13px] font-medium tracking-[0.02em]">{valor}</dd>
              </div>
            ))}
          </dl>

          {/* Cifras calculadas a partir del plan de pagos */}
          <Rejilla>
            <Cifra
              rotulo={sistema === 'FRANCES' ? 'Cuota mensual' : 'Primera cuota'}
              valor={pesosExactos(credito.cuotaMensual)}
              nota={
                sistema === 'FRANCES'
                  ? `Fija en los ${credito.numeroCuotas} periodos`
                  : cuotasDelPlan.length > 0
                    ? `Decreciente · la última es ${pesosExactos(cuotasDelPlan[cuotasDelPlan.length - 1].valorCuota)}`
                    : 'Decreciente'
              }
            />
            <Cifra
              rotulo="Total a pagar"
              valor={totales ? pesosExactos(totales.pagado) : '…'}
              nota={notaTotales}
            />
            <Cifra
              rotulo="Total intereses"
              valor={totales ? pesosExactos(totales.intereses) : '…'}
              nota={sinPlan ? 'Estimado con la tasa pactada' : 'Suma del plan de amortización'}
              rojo
            />
          </Rejilla>

          {/* Transiciones */}
          <section className="flex flex-col gap-4">
            <header className="flex items-center justify-between border-b-2 border-tinta pb-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em]">
                [ 04 ] Cambio de estado
              </h2>
              <code className="text-[10px] uppercase tracking-[0.04em] text-tenue">
                transicionesPermitidas: [
                {credito.transicionesPermitidas.map((t) => `"${t}"`).join(',')}]
              </code>
            </header>

            {!puedeCambiar ? (
              <p className="border-2 border-tinta bg-hundido px-4 py-4 text-[11px] uppercase tracking-[0.04em] text-apagada">
                Tu rol consulta, no gestiona. El cambio de estado lo hace un analista o un
                administrador.
              </p>
            ) : credito.transicionesPermitidas.length === 0 ? (
              <p className="border-2 border-tinta bg-hundido px-4 py-4 text-[11px] uppercase tracking-[0.04em] text-apagada">
                Estado terminal. No hay transiciones posibles desde {credito.estado}.
              </p>
            ) : (
              <div className="flex gap-3">
                {credito.transicionesPermitidas.map((t) => {
                  const critica = EXIGEN_OBSERVACION.includes(t)
                  return (
                    <Boton
                      key={t}
                      variante={t === 'RECHAZADO' ? 'peligro' : critica ? 'secundario' : 'primario'}
                      flecha={!critica}
                      className={critica ? '' : 'flex-1'}
                      onClick={() => {
                        setDestino(t)
                        setObservacion('')
                        transicion.reset()
                      }}
                    >
                      {ACCION[t] ?? t}
                    </Boton>
                  )
                })}
              </div>
            )}

            <p className="text-[10px] uppercase tracking-[0.06em] text-tenue">
              Solo se pintan las transiciones que envía el backend. La máquina de estados no se
              reimplementa en el navegador.
            </p>
          </section>
        </div>

        {/* Bitácora */}
        <aside className="flex flex-1 flex-col bg-tinta text-papel">
          <div className="flex items-center justify-between bg-rojo px-6 py-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em]">[ Historial ]</h2>
            <span className="text-[10px] uppercase tracking-[0.08em]">Append-only</span>
          </div>

          {bitacora.isPending ? (
            <div className="flex flex-col gap-4 px-6 py-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-[#2a2a28]" />
              ))}
            </div>
          ) : bitacora.isError ? (
            <p className="px-6 py-6 text-[11px] uppercase tracking-[0.06em] text-rojo">
              No se pudo cargar la bitácora.
            </p>
          ) : (
            <ol className="flex flex-col px-6 py-6">
              {bitacora.data.map((e, i) => (
                <li key={`${e.fecha}-${e.estadoNuevo}`} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-rojo">+</span>
                    {i < bitacora.data.length - 1 && <span className="w-px flex-1 bg-[#2a2a28]" />}
                  </div>
                  <div className="flex flex-col gap-2 pb-7">
                    <div className="flex items-center gap-2.5">
                      {e.estadoAnterior ? (
                        <EtiquetaEstado estado={e.estadoAnterior} />
                      ) : (
                        <span className="text-[11px] text-tenue">———</span>
                      )}
                      <span className="text-rojo">→</span>
                      <EtiquetaEstado estado={e.estadoNuevo} />
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.06em] text-tenue">
                      {e.usuarioNombre} · {fechaLarga(e.fecha)}
                    </p>
                    {e.observacion && (
                      <p className="text-[11px] tracking-[0.02em]">«{e.observacion}»</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-auto px-6 pb-6 text-[10px] uppercase leading-[1.7] tracking-[0.04em] text-tenue">
            Cada cambio de estado escribe su fila en la misma transacción. La bitácora nunca se
            actualiza ni se borra.
          </p>
        </aside>
      </div>

      {/* Diálogo de cambio de estado */}
      {destino && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-tinta/40 px-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-dialogo"
            className="w-[520px] border-4 border-tinta bg-papel"
          >
            <h2
              id="titulo-dialogo"
              className="bg-rojo px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-papel"
            >
              [ {ACCION[destino] ?? destino} ]
            </h2>

            <div className="flex flex-col gap-4 px-6 py-6">
              <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">
                {credito.numeroCredito} · {credito.estado} → {destino}
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="observacion" className="rotulo">
                    Observación
                  </label>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-rojo">
                    {exigeObservacion ? '[ obligatoria ]' : '[ opcional ]'} · mín.{' '}
                    {OBSERVACION_MINIMA} caracteres
                  </span>
                </div>
                <textarea
                  id="observacion"
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  rows={4}
                  maxLength={OBSERVACION_MAXIMA}
                  aria-invalid={observacionInvalida}
                  className="border-2 border-tinta bg-hundido px-3.5 py-3.5 text-[13px] outline-none"
                />
                <p
                  className={`text-[10px] uppercase tracking-[0.06em] ${
                    observacionInvalida ? 'text-rojo' : 'text-apagada'
                  }`}
                >
                  {observacionInvalida
                    ? `El mínimo son ${OBSERVACION_MINIMA} caracteres: ${
                        OBSERVACION_MINIMA - escrita.length === 1
                          ? 'falta 1'
                          : `faltan ${OBSERVACION_MINIMA - escrita.length}`
                      }`
                    : `${escrita.length} / ${OBSERVACION_MAXIMA} caracteres`}
                </p>
              </div>

              {exigeObservacion && (
                <p className="text-[10px] uppercase leading-[1.6] tracking-[0.04em] text-apagada">
                  Un rechazo sin motivo deja la bitácora sin capacidad de responder por qué se tomó
                  la decisión.
                </p>
              )}

              {transicion.isError && <ErrorEnLinea error={transicion.error} />}

              <div className="flex gap-3">
                <Boton
                  flecha
                  className="flex-1"
                  disabled={transicion.isPending || observacionInvalida}
                  onClick={() =>
                    transicion.mutate({
                      estado: destino,
                      observacion: observacion.trim() || undefined,
                    })
                  }
                >
                  {transicion.isPending ? 'Aplicando…' : 'Confirmar'}
                </Boton>
                <Boton
                  variante="secundario"
                  disabled={transicion.isPending}
                  onClick={() => setDestino(null)}
                >
                  Volver
                </Boton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Tarjeta de cifra calculada del detalle. */
function Cifra({
  rotulo,
  valor,
  nota,
  rojo,
}: {
  rotulo: string
  valor: string
  nota: string
  rojo?: boolean
}) {
  return (
    <article className="flex flex-1 flex-col gap-2.5 bg-papel px-5 py-5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.10em]">{rotulo}</h3>
      <p className={`cifra text-[30px] ${rojo ? 'text-rojo' : ''}`}>{valor}</p>
      <p className="text-[10px] uppercase tracking-[0.04em] text-apagada">{nota}</p>
    </article>
  )
}
