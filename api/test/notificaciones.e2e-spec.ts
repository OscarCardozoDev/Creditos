import { createHmac, randomUUID } from 'node:crypto';
import { api, conEscritura, conSesion, ejecutarSql, identificacionUnica, iniciarSesion, SesionPrueba } from './apoyo-e2e';

/**
 * Casos de Documentacion/operacion/02_pruebas.md S5: integracion con el sistema externo.
 *
 * La suite corre con el `WEBHOOK_URL` del .env apuntando a un receptor que no existe, asi que el
 * escenario "el tercero esta caido" no hay que montarlo: es la condicion por defecto. Eso hace que
 * el caso 3 —crear un credito con el receptor inalcanzable y recibir 201 igual— pruebe justo lo que
 * el diseno promete, sin simular nada.
 */
describe('Notificaciones y webhook (e2e)', () => {
  let analista: SesionPrueba;

  beforeAll(async () => {
    analista = await iniciarSesion('analista@local');
  });

  interface FilaNotificacion {
    evento: string;
    estado: string;
    payload: string;
    enviado_en: Date | null;
  }

  /** Lee las notificaciones de un credito, de la mas reciente a la mas antigua. */
  function notificacionesDe(creditoId: string): Promise<FilaNotificacion[]> {
    return ejecutarSql<FilaNotificacion>(
      `SELECT evento, estado, payload, enviado_en FROM dbo.Notificaciones
       WHERE credito_id = @creditoId ORDER BY notificacion_id DESC`,
      { creditoId },
    );
  }

  /** Cuerpo de alta valido, con una identificacion de asociado nueva por llamada. */
  function creditoValido(overrides: Record<string, unknown> = {}) {
    return {
      identificacionAsociado: identificacionUnica('80'),
      nombreAsociado: 'Asociado Webhook E2E',
      tipoCredito: 'LIBRE_INVERSION',
      valorSolicitado: 4000000,
      numeroCuotas: 12,
      formaPago: 'CAJA',
      ...overrides,
    };
  }

  /** Registra un credito por la via normal y devuelve su identificador. */
  async function crearCredito(overrides: Record<string, unknown> = {}): Promise<string> {
    const respuesta = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido(overrides)).expect(201);
    return respuesta.body.data.id as string;
  }

  it('1. registrar un credito deja una fila credito.creado en la bandeja de salida', async () => {
    const creditoId = await crearCredito();

    const filas = await notificacionesDe(creditoId);

    expect(filas).toHaveLength(1);
    expect(filas[0].evento).toBe('credito.creado');
    const cuerpo = JSON.parse(filas[0].payload);
    expect(cuerpo.event).toBe('credito.creado');
    expect(cuerpo.eventId).toEqual(expect.any(String));
    expect(cuerpo.data.id).toBe(creditoId);
    expect(cuerpo.data.estado).toBe('SOLICITADO');
  });

  it('2. cambiar el estado deja una segunda fila credito.estado_cambiado', async () => {
    const creditoId = await crearCredito();

    await conEscritura(api().patch(`/api/creditos/${creditoId}/estado`), analista)
      .send({ estado: 'APROBADO', observacion: 'Cumple capacidad de pago' })
      .expect(200);

    const filas = await notificacionesDe(creditoId);
    expect(filas.map((f) => f.evento)).toEqual(['credito.estado_cambiado', 'credito.creado']);
    const cuerpo = JSON.parse(filas[0].payload);
    expect(cuerpo.data.estadoAnterior).toBe('SOLICITADO');
    expect(cuerpo.data.estadoNuevo).toBe('APROBADO');
  });

  it('3. con el receptor caido el credito se registra igual y su evento queda pendiente', async () => {
    const creditoId = await crearCredito();

    // El credito existe y es consultable: la caida del tercero no toco la respuesta de la API.
    await conSesion(api().get(`/api/creditos/${creditoId}`), analista).expect(200);

    // Y su notificacion no puede haberse entregado, porque no hay a quien entregarla.
    const [notificacion] = await notificacionesDe(creditoId);
    expect(['PENDIENTE', 'ENVIANDO']).toContain(notificacion.estado);
    expect(notificacion.enviado_en).toBeNull();
  });

  describe('receptor POST /api/webhooks/creditos', () => {
    const secreto = () => process.env.WEBHOOK_SECRET as string;

    /**
     * Calcula la firma aqui en vez de importar `firmar` de src: si la prueba reusara la misma
     * funcion que el guard, un cambio de algoritmo pasaria verde en las dos puntas a la vez.
     */
    function firmaDe(cuerpo: string, clave: string): string {
      return 'sha256=' + createHmac('sha256', clave).update(cuerpo).digest('hex');
    }

    /** Arma el evento entrante y lo manda firmado, byte a byte igual a lo que se firmo. */
    function enviarEvento(evento: Record<string, unknown>, firmaSecreto = secreto()) {
      const cuerpo = JSON.stringify(evento);
      return api()
        .post('/api/webhooks/creditos')
        .set('Content-Type', 'application/json')
        .set('X-Signature', firmaDe(cuerpo, firmaSecreto))
        .send(cuerpo);
    }

    /** Evento de alta valido, recien generado y con una identificacion nueva. */
    function eventoValido(overrides: Record<string, unknown> = {}) {
      return {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        data: creditoValido(),
        ...overrides,
      };
    }

    it('4. un evento firmado registra el credito reutilizando la logica de alta', async () => {
      const datos = creditoValido();

      const respuesta = await enviarEvento(eventoValido({ data: datos })).expect(200);
      expect(respuesta.body.data.procesado).toBe(true);

      // El credito llego por la misma ruta de negocio: aparece en el listado normal y ya trae
      // su propia fila en la bandeja de salida, igual que un alta por HTTP.
      const listado = await conSesion(
        api().get(`/api/creditos?identificacion=${datos.identificacionAsociado}`),
        analista,
      ).expect(200);
      expect(listado.body.data).toHaveLength(1);
      expect(listado.body.data[0].estado).toBe('SOLICITADO');

      const filas = await notificacionesDe(listado.body.data[0].id as string);
      expect(filas.map((f) => f.evento)).toEqual(['credito.creado']);
    });

    it('5. el mismo eventId dos veces no crea el credito dos veces', async () => {
      const datos = creditoValido();
      const evento = eventoValido({ data: datos });

      await enviarEvento(evento).expect(200);
      const reintento = await enviarEvento(evento).expect(200);

      expect(reintento.body.data.procesado).toBe(false);
      const listado = await conSesion(
        api().get(`/api/creditos?identificacion=${datos.identificacionAsociado}`),
        analista,
      ).expect(200);
      expect(listado.body.data).toHaveLength(1);
    });

    it('6. una firma que no corresponde al cuerpo responde 401 FIRMA_INVALIDA', async () => {
      const respuesta = await enviarEvento(eventoValido(), 'secreto-que-no-es').expect(401);

      expect(respuesta.body.error.code).toBe('FIRMA_INVALIDA');
    });

    it('7. un evento vencido responde 401 aunque la firma sea valida', async () => {
      const haceUnaHora = new Date(Date.now() - 60 * 60_000).toISOString();

      const respuesta = await enviarEvento(eventoValido({ timestamp: haceUnaHora })).expect(401);

      expect(respuesta.body.error.code).toBe('FIRMA_INVALIDA');
    });

    it('8. un evento que incumple una regla de negocio se puede reintentar despues', async () => {
      // COMERCIAL exige persona juridica: crear() falla con 422 y la marca de idempotencia se
      // libera, para que el reintento del emisor no reciba "ya procesado" para siempre.
      const evento = eventoValido({ data: creditoValido({ tipoCredito: 'COMERCIAL' }) });

      await enviarEvento(evento).expect(422);
      const reintento = await enviarEvento(evento).expect(422);

      expect(reintento.body.error.code).toBe('REGLA_NEGOCIO');
    });
  });
});
