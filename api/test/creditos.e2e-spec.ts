import { randomUUID } from 'node:crypto';
import { api, conEscritura, conSesion, identificacionUnica, iniciarSesion, SesionPrueba } from './apoyo-e2e';

/**
 * Casos 1 a 13 de Documentacion/operacion/02_pruebas.md S4: ciclo de vida de la solicitud de
 * credito. Cada `it` usa una identificacion de asociado propia (identificacionUnica) para no
 * depender de datos que deje otro caso ni de la carga inicial del seed.
 */
describe('Creditos (e2e)', () => {
  let analista: SesionPrueba;
  let admin: SesionPrueba;

  beforeAll(async () => {
    analista = await iniciarSesion('analista@local');
    admin = await iniciarSesion('admin@local');
  });

  /** Arma un cuerpo de credito valido, con una identificacion de asociado nueva por llamada. */
  function creditoValido(overrides: Record<string, unknown> = {}) {
    return {
      identificacionAsociado: identificacionUnica('70'),
      nombreAsociado: 'Asociado de Prueba E2E',
      tipoCredito: 'LIBRE_INVERSION',
      valorSolicitado: 5000000,
      numeroCuotas: 12,
      formaPago: 'CAJA',
      ...overrides,
    };
  }

  it('1. registro valido de solicitud responde 201 con identificador, numero y estado SOLICITADO', async () => {
    const respuesta = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);

    expect(respuesta.body.success).toBe(true);
    expect(respuesta.body.data.id).toEqual(expect.any(String));
    expect(respuesta.body.data.numeroCredito).toMatch(/^CR-\d{4}-\d{6}$/);
    expect(respuesta.body.data.estado).toBe('SOLICITADO');
  });

  it('2. valor solicitado negativo responde 400 VALIDATION_ERROR', async () => {
    const respuesta = await conEscritura(api().post('/api/creditos'), analista)
      .send(creditoValido({ valorSolicitado: -1 }))
      .expect(400);

    expect(respuesta.body.success).toBe(false);
    expect(respuesta.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('3. numero de cuotas en cero responde 400', async () => {
    const respuesta = await conEscritura(api().post('/api/creditos'), analista)
      .send(creditoValido({ numeroCuotas: 0 }))
      .expect(400);

    expect(respuesta.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('4. credito comercial para persona natural responde 422 REGLA_NEGOCIO', async () => {
    const respuesta = await conEscritura(api().post('/api/creditos'), analista)
      .send(creditoValido({ tipoCredito: 'COMERCIAL', numeroCuotas: 24 }))
      .expect(422);

    expect(respuesta.body.error.code).toBe('REGLA_NEGOCIO');
  });

  it('5. segunda solicitud equivalente en tramite responde 409 CREDITO_DUPLICADO', async () => {
    const cuerpo = creditoValido();

    await conEscritura(api().post('/api/creditos'), analista).send(cuerpo).expect(201);
    const segunda = await conEscritura(api().post('/api/creditos'), analista).send(cuerpo).expect(409);

    expect(segunda.body.error.code).toBe('CREDITO_DUPLICADO');
  });

  it('6. consulta de un identificador inexistente responde 404 CREDITO_NOT_FOUND', async () => {
    const respuesta = await conSesion(api().get(`/api/creditos/${randomUUID()}`), analista).expect(404);

    expect(respuesta.body.error.code).toBe('CREDITO_NOT_FOUND');
  });

  it('7. transicion SOLICITADO a APROBADO responde 200 y agrega una fila al historial', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;

    const cambio = await conEscritura(api().patch(`/api/creditos/${id}/estado`), analista)
      .send({ estado: 'APROBADO' })
      .expect(200);
    expect(cambio.body.data.estado).toBe('APROBADO');

    const historial = await conSesion(api().get(`/api/creditos/${id}/historial`), analista).expect(200);
    expect(historial.body.data).toHaveLength(2);
    expect(historial.body.data[0].estadoNuevo).toBe('APROBADO');

    // El plan de cuotas nace al aprobar, ahora que se aprueba desde SOLICITADO.
    const cuotas = await conSesion(api().get(`/api/creditos/${id}/cuotas`), analista).expect(200);
    expect(cuotas.body.data).toHaveLength(12);
  });

  it('7b. el estudio ya no es un destino de SOLICITADO', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);

    const invalida = await conEscritura(api().patch(`/api/creditos/${creado.body.data.id}/estado`), analista)
      .send({ estado: 'EN_ESTUDIO' })
      .expect(422);
    expect(invalida.body.error.code).toBe('TRANSICION_INVALIDA');
  });

  it('8. transicion RECHAZADO a DESEMBOLSADO responde 422 TRANSICION_INVALIDA', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;

    await conEscritura(api().patch(`/api/creditos/${id}/estado`), analista)
      .send({ estado: 'RECHAZADO', observacion: 'No cumple politica de riesgo.' })
      .expect(200);

    const invalida = await conEscritura(api().patch(`/api/creditos/${id}/estado`), analista)
      .send({ estado: 'DESEMBOLSADO' })
      .expect(422);
    expect(invalida.body.error.code).toBe('TRANSICION_INVALIDA');
  });

  it('9. rechazo sin observacion responde 400', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;

    const respuesta = await conEscritura(api().patch(`/api/creditos/${id}/estado`), analista)
      .send({ estado: 'RECHAZADO' })
      .expect(400);
    expect(respuesta.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('10. edicion con version obsoleta en If-Match responde 409 CONCURRENCIA_CONFLICTO', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;
    const v1 = creado.body.data.version;

    await conEscritura(api().patch(`/api/creditos/${id}`), analista)
      .set('If-Match', v1)
      .send({ valorSolicitado: 6000000 })
      .expect(200);

    const obsoleta = await conEscritura(api().patch(`/api/creditos/${id}`), analista)
      .set('If-Match', v1)
      .send({ valorSolicitado: 7000000 })
      .expect(409);
    expect(obsoleta.body.error.code).toBe('CONCURRENCIA_CONFLICTO');
  });

  it('11. edicion de un credito ya aprobado responde 422 CREDITO_INMUTABLE', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;

    const aprobado = await conEscritura(api().patch(`/api/creditos/${id}/estado`), analista)
      .send({ estado: 'APROBADO' })
      .expect(200);

    const respuesta = await conEscritura(api().patch(`/api/creditos/${id}`), analista)
      .set('If-Match', aprobado.body.data.version)
      .send({ valorSolicitado: 6000000 })
      .expect(422);
    expect(respuesta.body.error.code).toBe('CREDITO_INMUTABLE');
  });

  it('12. borrado logico y consulta posterior responde 204 y luego 404', async () => {
    const creado = await conEscritura(api().post('/api/creditos'), analista).send(creditoValido()).expect(201);
    const id = creado.body.data.id;

    await conEscritura(api().delete(`/api/creditos/${id}`), admin).expect(204);
    const respuesta = await conSesion(api().get(`/api/creditos/${id}`), admin).expect(404);
    expect(respuesta.body.error.code).toBe('CREDITO_NOT_FOUND');
  });

  it('13. listado con filtro y paginacion responde 200 con meta coherente y solo el estado pedido', async () => {
    const identificacion = identificacionUnica('71');
    for (let i = 0; i < 3; i += 1) {
      await conEscritura(api().post('/api/creditos'), analista)
        .send(
          creditoValido({
            identificacionAsociado: identificacion,
            tipoCredito: 'MICROCREDITO',
            valorSolicitado: 1000000 + i,
            numeroCuotas: 6,
          }),
        )
        .expect(201);
    }

    const respuesta = await conSesion(
      api().get('/api/creditos').query({ identificacion, estado: 'SOLICITADO', page: 1, limit: 10 }),
      analista,
    ).expect(200);

    expect(respuesta.body.data).toHaveLength(3);
    expect(respuesta.body.data.every((c: { estado: string }) => c.estado === 'SOLICITADO')).toBe(true);
    expect(respuesta.body.meta).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });
});
