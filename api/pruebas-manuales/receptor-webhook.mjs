/**
 * Receptor de prueba para el webhook saliente. Sin dependencias: solo Node.
 *
 *   node api/pruebas-manuales/receptor-webhook.mjs
 *   node api/pruebas-manuales/receptor-webhook.mjs --estado=500   # simula un tercero caido
 *   node api/pruebas-manuales/receptor-webhook.mjs --estado=400   # simula un rechazo definitivo
 *
 * Escucha en el puerto al que apunta WEBHOOK_URL del .env (4000 por omision), recalcula el
 * HMAC-SHA256 del cuerpo crudo con WEBHOOK_SECRET y lo compara contra la cabecera X-Signature.
 * Que la firma se verifique aqui, con codigo que no es el de la API, es la prueba de que la
 * integridad del evento se puede comprobar sin confiar en quien lo envia.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lee una variable del .env de la raiz, que es el mismo que alimenta a docker compose. */
function variable(nombre, porOmision) {
  try {
    const linea = readFileSync(resolve(RAIZ, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${nombre}=`));
    return linea ? linea.slice(nombre.length + 1).trim() : porOmision;
  } catch {
    return porOmision;
  }
}

const SECRETO = process.env.WEBHOOK_SECRET ?? variable('WEBHOOK_SECRET');
const PUERTO = Number(new URL(variable('WEBHOOK_URL', 'http://localhost:4000/receptor')).port || 4000);
const ESTADO = Number(process.argv.find((a) => a.startsWith('--estado='))?.split('=')[1] ?? 200);

if (!SECRETO) {
  console.error('Falta WEBHOOK_SECRET: definirlo en el .env de la raiz o en el entorno.');
  process.exit(1);
}

/** Compara en tiempo constante, igual que lo hace el guard de la API. */
function firmasIguales(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

const vistos = new Set();

createServer((peticion, respuesta) => {
  let crudo = '';
  peticion.on('data', (trozo) => (crudo += trozo));
  peticion.on('end', () => {
    const recibida = peticion.headers['x-signature'] ?? '';
    // La API antepone "sha256=" al hex, igual que GitHub.
    const esperada = 'sha256=' + createHmac('sha256', SECRETO).update(crudo, 'utf8').digest('hex');
    const valida = firmasIguales(recibida, esperada);

    let cuerpo;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      cuerpo = {};
    }

    // El emisor garantiza "al menos una vez": el eventId es lo que hace idempotente al receptor.
    const eventId = peticion.headers['x-event-id'] ?? cuerpo.eventId;
    const repetido = vistos.has(eventId);
    vistos.add(eventId);

    console.log(
      [
        `${valida ? '✓ firma valida' : '✗ FIRMA INVALIDA'}  ${cuerpo.event ?? '(sin evento)'}` +
          (repetido ? '  [repetido: ya visto este eventId]' : ''),
        `  eventId    ${eventId}`,
        `  X-Signature ${recibida}`,
        `  calculada   ${esperada}`,
        `  data        ${JSON.stringify(cuerpo.data ?? {})}`,
        `  respondo    ${ESTADO}`,
      ].join('\n'),
    );

    respuesta.writeHead(ESTADO, { 'Content-Type': 'application/json' });
    respuesta.end(JSON.stringify({ recibido: ESTADO < 400 }));
  });
}).listen(PUERTO, () => {
  console.log(`Receptor de webhook escuchando en http://localhost:${PUERTO} · respondiendo ${ESTADO}`);
  console.log('Registra un credito o cambia su estado y el evento aparecera aqui en menos de 10 s.\n');
});
