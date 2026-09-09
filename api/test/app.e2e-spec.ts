import { api } from './apoyo-e2e';

/** Comprobacion minima de arranque: la app conecta a la base real y /api/health responde en verde. */
describe('AppController (e2e)', () => {
  it('/api/health (GET) responde ok con la base disponible', async () => {
    const respuesta = await api().get('/api/health').expect(200);
    expect(respuesta.body).toEqual({ success: true, data: { estado: 'ok', base: 'ok' } });
  });
});
