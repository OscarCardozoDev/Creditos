import 'reflect-metadata';
import { hash } from '@node-rs/argon2';
import { DataSource } from 'typeorm';
import fuente from './config/data-source';
import { Credencial } from './entidades/credencial.entidad';
import { Credito } from './entidades/credito.entidad';
import { EstadoCredito, FormaPago, TipoCredito, TipoPersona, TipoUsuario } from './entidades/enums';
import { HistorialCredito } from './entidades/historial-credito.entidad';
import { Usuario } from './entidades/usuario.entidad';

/** Contrasena de los usuarios de desarrollo. No sirve fuera de un entorno local. */
const CLAVE_DESARROLLO = 'Desarrollo.2026';

const OPERADORES = [
  {
    identificacion: '900000001',
    nombre: 'Administradora del Sistema',
    correo: 'admin@local',
    rol: TipoUsuario.ADMIN,
  },
  {
    identificacion: '900000002',
    nombre: 'Analista de Credito',
    correo: 'analista@local',
    rol: TipoUsuario.ANALISTA,
  },
  {
    identificacion: '900000003',
    nombre: 'Asociado de Prueba',
    correo: 'asociado@local',
    rol: TipoUsuario.ASOCIADO,
  },
];

const DEUDORES = [
  {
    identificacion: '1001234567',
    nombre: 'Juan Perez',
    persona: TipoPersona.PERSONA_NATURAL,
  },
  {
    identificacion: '1002345678',
    nombre: 'Maria Gomez',
    persona: TipoPersona.PERSONA_NATURAL,
  },
  {
    identificacion: '1003456789',
    nombre: 'Carlos Ruiz',
    persona: TipoPersona.PERSONA_NATURAL,
  },
  {
    identificacion: '9007654321',
    nombre: 'Distribuciones del Valle S.A.S.',
    persona: TipoPersona.PERSONA_JURIDICA,
  },
];

/** Un credito por estado, para que los filtros y el tablero tengan contenido desde el primer arranque. */
const CREDITOS = [
  {
    deudor: 0,
    tipo: TipoCredito.LIBRE_INVERSION,
    valor: '15000000.00',
    tasa: '1.388843',
    cuotas: 36,
    forma: FormaPago.NOMINA,
    estado: EstadoCredito.SOLICITADO,
  },
  {
    deudor: 0,
    tipo: TipoCredito.VEHICULO,
    valor: '40000000.00',
    tasa: '1.097884',
    cuotas: 60,
    forma: FormaPago.DEBITO_AUTOMATICO,
    estado: EstadoCredito.SOLICITADO,
  },
  {
    deudor: 1,
    tipo: TipoCredito.LIBRANZA,
    valor: '8000000.00',
    tasa: '0.948879',
    cuotas: 24,
    forma: FormaPago.NOMINA,
    estado: EstadoCredito.APROBADO,
  },
  {
    deudor: 1,
    tipo: TipoCredito.MICROCREDITO,
    valor: '3000000.00',
    tasa: '2.076104',
    cuotas: 18,
    forma: FormaPago.CAJA,
    estado: EstadoCredito.RECHAZADO,
  },
  {
    deudor: 2,
    tipo: TipoCredito.HIPOTECARIO,
    valor: '180000000.00',
    tasa: '0.873459',
    cuotas: 240,
    forma: FormaPago.DEBITO_AUTOMATICO,
    estado: EstadoCredito.DESEMBOLSADO,
  },
  {
    deudor: 3,
    tipo: TipoCredito.COMERCIAL,
    valor: '90000000.00',
    tasa: '1.243888',
    cuotas: 48,
    forma: FormaPago.DEBITO_AUTOMATICO,
    estado: EstadoCredito.CANCELADO,
  },
];

/** Camino que llevo a cada estado, para que la bitacora sea coherente y no aparezca un salto imposible. */
const RUTA: Record<EstadoCredito, EstadoCredito[]> = {
  [EstadoCredito.SOLICITADO]: [],
  [EstadoCredito.EN_ESTUDIO]: [],
  [EstadoCredito.APROBADO]: [EstadoCredito.APROBADO],
  [EstadoCredito.RECHAZADO]: [EstadoCredito.RECHAZADO],
  [EstadoCredito.DESEMBOLSADO]: [EstadoCredito.APROBADO, EstadoCredito.DESEMBOLSADO],
  [EstadoCredito.CANCELADO]: [EstadoCredito.CANCELADO],
};

/** Pide el siguiente consecutivo a la secuencia y le da el formato CR-{anio}-{6 digitos}. */
async function siguienteNumero(fuente: DataSource): Promise<string> {
  const [{ n }] = await fuente.query<{ n: number }[]>('SELECT NEXT VALUE FOR dbo.Seq_NumCredito AS n');
  return `CR-${new Date().getUTCFullYear()}-${String(n).padStart(6, '0')}`;
}

/** Carga usuarios, credenciales y creditos de ejemplo si la base esta vacia. */
async function sembrar() {
  await fuente.initialize();
  if (await fuente.getRepository(Usuario).count()) {
    console.log('La base ya tiene datos: no se siembra nada.');
    await fuente.destroy();
    return;
  }

  const passwordHash = await hash(CLAVE_DESARROLLO);

  await fuente.transaction(async (gestor) => {
    for (const o of OPERADORES) {
      const usuario = await gestor.save(
        gestor.create(Usuario, {
          identificacion: o.identificacion,
          nombreRazonSocial: o.nombre,
          tipoPersona: TipoPersona.PERSONA_NATURAL,
          tipoUsuario: o.rol,
        }),
      );
      await gestor.save(
        gestor.create(Credencial, {
          usuarioId: usuario.usuarioId,
          correo: o.correo,
          passwordHash,
        }),
      );
    }

    const deudores: Usuario[] = [];
    for (const d of DEUDORES) {
      deudores.push(
        await gestor.save(
          gestor.create(Usuario, {
            identificacion: d.identificacion,
            nombreRazonSocial: d.nombre,
            tipoPersona: d.persona,
            tipoUsuario: TipoUsuario.ASOCIADO,
          }),
        ),
      );
    }

    const analista = await gestor.findOneByOrFail(Usuario, {
      identificacion: '900000002',
    });

    for (const c of CREDITOS) {
      const credito = await gestor.save(
        gestor.create(Credito, {
          numCredito: await siguienteNumero(fuente),
          deudorId: deudores[c.deudor].usuarioId,
          tipoCredito: c.tipo,
          valorSolicitado: c.valor,
          tasaInteres: c.tasa,
          numCuotas: c.cuotas,
          formaPago: c.forma,
          estado: c.estado,
        }),
      );

      let anterior: EstadoCredito | null = null;
      let actual = EstadoCredito.SOLICITADO;
      await gestor.save(
        gestor.create(HistorialCredito, {
          creditoId: credito.creditoId,
          estadoAnterior: null,
          estadoNuevo: actual,
          usuarioId: analista.usuarioId,
          usuarioNombre: analista.nombreRazonSocial,
          observacion: 'Solicitud registrada por la carga inicial.',
        }),
      );
      for (const destino of RUTA[c.estado]) {
        anterior = actual;
        actual = destino;
        await gestor.save(
          gestor.create(HistorialCredito, {
            creditoId: credito.creditoId,
            estadoAnterior: anterior,
            estadoNuevo: actual,
            usuarioId: analista.usuarioId,
            usuarioNombre: analista.nombreRazonSocial,
            observacion: 'Transicion de la carga inicial.',
          }),
        );
      }
    }
  });

  console.log(`Sembrados ${OPERADORES.length + DEUDORES.length} usuarios y ${CREDITOS.length} creditos.`);
  await fuente.destroy();
}

void sembrar();
