import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { ErrorApi } from '../api/cliente'
import { listar, resumen } from '../api/creditos'
import { ESTADOS, type Credito, type Estado, type Meta, type ResumenCreditos } from '../api/tipos'
import { Contenido, Encabezado } from '../componentes/Armazon'
import { ErrorPantalla, Esqueleto, EsqueletoBloques, Vacio } from '../componentes/estados'
import { fechaCorta, pesos } from '../componentes/formato'
import { esAsociado, useUsuario } from '../componentes/sesion'
import { Boton, EtiquetaEstado, Rejilla } from '../componentes/ui'

const TEXTO_ESTADO: Record<Estado, string> = {
  SOLICITADO: 'text-solicitado',
  EN_ESTUDIO: 'text-en-estudio',
  APROBADO: 'text-aprobado',
  DESEMBOLSADO: 'text-desembolsado',
  RECHAZADO: 'text-rechazado',
  CANCELADO: 'text-cancelado',
}

const BARRA_ESTADO: Record<Estado, string> = {
  SOLICITADO: 'bg-solicitado',
  EN_ESTUDIO: 'bg-en-estudio',
  APROBADO: 'bg-aprobado',
  DESEMBOLSADO: 'bg-desembolsado',
  RECHAZADO: 'bg-rechazado',
  CANCELADO: 'bg-cancelado',
}

type ConsultaListado = UseQueryResult<{ data: Credito[]; meta: Meta }, ErrorApi>

/** Tarjeta de una cifra: rótulo, número en negra y nota al pie. */
function TarjetaCifra({
  rotulo,
  cifra,
  nota,
  tamano,
}: {
  rotulo: string
  cifra: string
  nota: string
  tamano: string
}) {
  return (
    <article className="flex flex-1 flex-col justify-between gap-3 bg-papel px-6 pb-5 pt-5.5">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]">{rotulo}</h3>
      <p className={`cifra ${tamano}`}>{cifra}</p>
      <p className="text-[11px] uppercase tracking-[0.04em] text-apagada">{nota}</p>
    </article>
  )
}

/** Resumen operativo: conteos por estado y entrada al flujo de solicitud. */
export function Tablero() {
  const usuario = useUsuario()
  const propio = esAsociado(usuario.rol)

  const consulta = useQuery<ResumenCreditos, ErrorApi>({
    queryKey: ['creditos', 'resumen'],
    queryFn: resumen,
  })

  // Las últimas solicitudes van en una segunda consulta: el resumen no trae filas, y ese es
  // justamente el motivo de que su costo no crezca con el tamaño de la tabla.
  const ultimas: ConsultaListado = useQuery({
    queryKey: ['creditos', 'listado', { limit: 5, sort: 'fechaSolicitud:desc' }],
    queryFn: () => listar({ page: 1, limit: 5, sort: 'fechaSolicitud:desc' }),
  })

  return (
    <>
      <Encabezado
        antetitulo={propio ? '[ / ] Mi resumen' : '[ / ] Resumen operativo'}
        titulo="Tablero"
        meta={['get /api/creditos/resumen', 'un solo endpoint · group by estado en sql']}
      />

      {consulta.isPending ? (
        <Contenido>
          <EsqueletoBloques cuantos={3} alto={150} />
          <EsqueletoBloques cuantos={6} alto={170} />
        </Contenido>
      ) : consulta.isError ? (
        <ErrorPantalla error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : (
        <CuerpoTablero datos={consulta.data} ultimas={ultimas} />
      )}
    </>
  )
}

/** Cuerpo del tablero, ya con el resumen resuelto. */
function CuerpoTablero({ datos, ultimas }: { datos: ResumenCreditos; ultimas: ConsultaListado }) {
  const porEstado = new Map(datos.porEstado.map((f) => [f.estado, f.total]))
  // EN_ESTUDIO salió del flujo: su tarjeta solo aparece si algún crédito anterior sigue ahí.
  const tarjetas = ESTADOS.filter((e) => e !== 'EN_ESTUDIO' || (porEstado.get(e) ?? 0) > 0)

  if (datos.total === 0) {
    return (
      <Vacio
        titulo="Todavía no hay créditos registrados"
        detalle="El tablero se llena en cuanto exista la primera solicitud"
        accion={
          <Link to="/creditos/nuevo">
            <Boton flecha>Registrar la primera</Boton>
          </Link>
        }
      />
    )
  }

  return (
    <Contenido>
      <Rejilla>
        <TarjetaCifra
          rotulo="Total de créditos"
          cifra={String(datos.total)}
          nota="Todos los estados · sin eliminados"
          tamano="text-[76px]"
        />
        <TarjetaCifra
          rotulo="Monto total solicitado"
          cifra={pesos(datos.montoTotalSolicitado)}
          nota="COP · suma de valor_solicitado"
          tamano="text-[34px]"
        />
        <TarjetaCifra
          rotulo="Monto aprobado"
          cifra={pesos(datos.montoAprobado)}
          nota="COP · aprobado + desembolsado"
          tamano="text-[34px]"
        />
      </Rejilla>

      {/* Cada tarjeta enlaza al listado ya filtrado: el tablero es un punto de entrada. */}
      <Rejilla>
        {tarjetas.map((estado) => (
          <Link
            key={estado}
            to={`/creditos?estado=${estado}`}
            className="flex flex-1 flex-col bg-papel"
          >
            <div className={`h-2 ${BARRA_ESTADO[estado]}`} />
            <div className="flex flex-col gap-2.5 px-5 pb-4 pt-4.5">
              <h3
                className={`text-[11px] font-bold uppercase tracking-[0.10em] ${TEXTO_ESTADO[estado]}`}
              >
                {estado}
              </h3>
              <p className="cifra text-[62px]">{porEstado.get(estado) ?? 0}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.08em] text-apagada">
                  Ver listado
                </span>
                <span className="text-[10px] font-bold text-rojo">&gt;&gt;&gt;</span>
              </div>
            </div>
          </Link>
        ))}
      </Rejilla>

      <Link
        to="/creditos/nuevo"
        className="flex items-center justify-between gap-6 bg-tinta px-7 py-6"
      >
        <span className="flex flex-col gap-1.5">
          <span className="cifra text-[44px] uppercase text-papel">Solicitar crédito</span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-tenue">
            Simula la cuota antes de enviar · post /api/simulacion → post /api/creditos
          </span>
        </span>
        <span className="flex items-center gap-3.5 bg-rojo px-6 py-4.5 text-xs font-bold uppercase tracking-[0.10em] text-papel">
          Abrir formulario <span>&gt;&gt;&gt;</span>
        </span>
      </Link>

      {ultimas.isPending ? (
        <Esqueleto filas={5} anchos={[200, 280, 220, 240, 120]} />
      ) : ultimas.isError ? (
        <ErrorPantalla error={ultimas.error} reintentar={() => void ultimas.refetch()} />
      ) : (
        <table className="w-full border-2 border-tinta text-left">
          <caption className="sr-only">Últimas solicitudes registradas</caption>
          <thead>
            <tr className="bg-tinta text-[11px] font-bold uppercase tracking-[0.10em] text-papel">
              <th className="w-52 px-5 py-3 font-bold">N.º crédito</th>
              <th className="w-72 px-5 py-3 font-bold">Asociado</th>
              <th className="w-56 px-5 py-3 font-bold">Valor</th>
              <th className="w-60 px-5 py-3 font-bold">Tipo</th>
              <th className="px-5 py-3 font-bold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ultimas.data.data.map((c, i) => (
              <tr
                key={c.id}
                className={i < ultimas.data.data.length - 1 ? 'border-b border-tenue' : ''}
              >
                <td className="px-5 py-3.5 text-[11px] font-medium tracking-[0.04em]">
                  <Link to={`/creditos/${c.id}`}>{c.numeroCredito}</Link>
                </td>
                <td className="px-5 py-3.5 text-[11px] uppercase tracking-[0.04em] text-apagada">
                  {c.nombreAsociado}
                </td>
                <td className="px-5 py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                  {pesos(c.valorSolicitado)}
                </td>
                <td className="px-5 py-3.5 text-[11px] tracking-[0.04em] text-apagada">
                  {c.tipoCredito}
                </td>
                <td className="px-5 py-3.5">
                  <EtiquetaEstado estado={c.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[10px] uppercase tracking-[0.06em] text-tenue">
        Última actualización {fechaCorta(new Date().toISOString())} · los conteos salen de un
        group by, no de traer las filas al navegador
      </p>
    </Contenido>
  )
}
