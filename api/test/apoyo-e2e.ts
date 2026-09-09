import sql from 'mssql';
import request from 'supertest';

/** Clave de los usuarios de desarrollo sembrados por src/semilla.ts. */
export const CLAVE_DESARROLLO = 'Desarrollo.2026';

/** URL de la instancia real de la API que el globalSetup dejo corriendo para toda la suite. */
export function urlBase(): string {
  const url = process.env.API_URL_E2E;
  if (!url) {
    throw new Error('API_URL_E2E no esta definida: entorno-e2e.global-setup.js no corrio.');
  }
  return url;
}

/** Punto de partida de toda peticion de prueba, ya apuntando al servidor real. */
export function api(): request.Agent {
  return request(urlBase());
}

export interface SesionPrueba {
  cookie: string;
  csrf: string;
}

/**
 * Inicia sesion y devuelve la cabecera Cookie y el token anti-CSRF listos para usar.
 * No se apoya en el cookie-jar automatico de supertest porque este descarta las cookies
 * `Secure` cuando la peticion viaja por http, que es como corren las pruebas.
 */
export async function iniciarSesion(correo: string, password = CLAVE_DESARROLLO): Promise<SesionPrueba> {
  const respuesta = await api().post('/api/auth/login').send({ correo, password }).expect(200);

  const encabezados = respuesta.get('Set-Cookie') ?? [];
  const sid = extraerValorCookie(encabezados, '__Host-sid');
  const csrf = extraerValorCookie(encabezados, 'csrf-token');
  if (!sid || !csrf) {
    throw new Error('El login no devolvio las cookies de sesion esperadas.');
  }
  return { cookie: `__Host-sid=${sid}; csrf-token=${csrf}`, csrf };
}

/** Busca el valor de una cookie concreta entre las cabeceras Set-Cookie de una respuesta. */
function extraerValorCookie(encabezados: string[], nombre: string): string | undefined {
  const linea = encabezados.find((c) => c.startsWith(`${nombre}=`));
  return linea?.split(';')[0].split('=').slice(1).join('=');
}

/** Adjunta la cookie de sesion a una peticion de lectura. */
export function conSesion(peticion: request.Test, sesion: SesionPrueba): request.Test {
  return peticion.set('Cookie', sesion.cookie);
}

/** Adjunta la cookie de sesion y la cabecera anti-CSRF a una peticion de escritura. */
export function conEscritura(peticion: request.Test, sesion: SesionPrueba): request.Test {
  return peticion.set('Cookie', sesion.cookie).set('X-CSRF-Token', sesion.csrf);
}

/** Genera una identificacion numerica que no colisiona entre pruebas del mismo archivo. */
export function identificacionUnica(prefijo: string): string {
  return `${prefijo}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Ejecuta una sentencia SQL directa contra la base de pruebas y devuelve las filas que produzca.
 * Es la unica forma de comprobar lo que la API no expone por HTTP: la fila de la bandeja de
 * salida, o el `expira_en` de una sesion. Usa el driver `mssql` en vez de TypeORM porque la
 * version instalada de `@nestjs/typeorm` es ESM-only y no la carga el cargador de modulos de Jest.
 */
export async function ejecutarSql<T = Record<string, unknown>>(
  consulta: string,
  parametros: Record<string, string> = {},
): Promise<T[]> {
  const conexion = await sql.connect({
    server: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true, useUTC: true },
  });
  try {
    const peticion = conexion.request();
    for (const [nombre, valor] of Object.entries(parametros)) {
      peticion.input(nombre, valor);
    }
    const resultado = await peticion.query<T>(consulta);
    return resultado.recordset ?? [];
  } finally {
    await conexion.close();
  }
}
