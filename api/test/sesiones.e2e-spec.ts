import { createHash } from 'node:crypto';
import { api, conEscritura, conSesion, ejecutarSql, identificacionUnica, iniciarSesion } from './apoyo-e2e';

/**
 * Casos 14 a 18 de Documentacion/operacion/02_pruebas.md S4: lo que demuestra que la sesion de
 * servidor entrega revocacion inmediata y control de vencimiento, no solo autenticacion. Usa sus
 * propias identificaciones de asociado, distintas de las de creditos.e2e-spec.ts.
 */
describe('Sesiones y control de acceso (e2e)', () => {
  it('14. peticion sin cookie de sesion responde 401 NO_AUTENTICADO', async () => {
    const respuesta = await api().get('/api/creditos').expect(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('15. escritura sin cabecera anti-CSRF responde 403 CSRF_INVALIDO', async () => {
    const analista = await iniciarSesion('analista@local');

    const respuesta = await conSesion(api().post('/api/creditos'), analista)
      .send({
        identificacionAsociado: identificacionUnica('72'),
        nombreAsociado: 'Asociado Sin CSRF',
        tipoCredito: 'LIBRE_INVERSION',
        valorSolicitado: 3000000,
        numeroCuotas: 12,
        formaPago: 'CAJA',
      })
      .expect(403);
    expect(respuesta.body.error.code).toBe('CSRF_INVALIDO');
  });

  it('16. un asociado consultando un credito ajeno responde 403', async () => {
    const analista = await iniciarSesion('analista@local');
    const creado = await conEscritura(api().post('/api/creditos'), analista)
      .send({
        identificacionAsociado: identificacionUnica('73'),
        nombreAsociado: 'Deudor Ajeno',
        tipoCredito: 'LIBRE_INVERSION',
        valorSolicitado: 3000000,
        numeroCuotas: 12,
        formaPago: 'CAJA',
      })
      .expect(201);

    const asociado = await iniciarSesion('asociado@local');
    const respuesta = await conSesion(api().get(`/api/creditos/${creado.body.data.id}`), asociado).expect(403);
    expect(respuesta.body.error.code).toBe('SIN_PERMISO');
  });

  it('17. sesion revocada y peticion posterior responde 401 SESION_REVOCADA', async () => {
    const sesion = await iniciarSesion('asociado@local');
    await conEscritura(api().post('/api/auth/logout'), sesion).expect(204);

    const respuesta = await conSesion(api().get('/api/auth/yo'), sesion).expect(401);
    expect(respuesta.body.error.code).toBe('SESION_REVOCADA');
  });

  it('18b. el alta de usuarios rechaza el rol ADMIN con 422 REGLA_NEGOCIO', async () => {
    const admin = await iniciarSesion('admin@local');

    const respuesta = await conEscritura(api().post('/api/usuarios'), admin)
      .send({
        identificacion: identificacionUnica('74'),
        nombreRazonSocial: 'Administrador Intruso',
        tipoPersona: 'PERSONA_NATURAL',
        tipoUsuario: 'ADMIN',
        correo: `intruso-${Date.now()}@local`,
        password: 'ClaveDeDesarrollo.2026',
      })
      .expect(422);
    expect(respuesta.body.error.code).toBe('REGLA_NEGOCIO');
  });

  it('18. sesion pasada del vencimiento absoluto responde 401 SESION_EXPIRADA', async () => {
    const sesion = await iniciarSesion('asociado@local');
    const token = sesion.cookie.match(/__Host-sid=([^;]+)/)![1];
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await ejecutarSql(
      'UPDATE Sesiones SET expira_en = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE token_hash = @tokenHash',
      { tokenHash },
    );

    const respuesta = await conSesion(api().get('/api/auth/yo'), sesion).expect(401);
    expect(respuesta.body.error.code).toBe('SESION_EXPIRADA');
  });
});
