const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const RAIZ_PROYECTO = path.join(__dirname, '..', '..');
const CARPETA_API = path.join(__dirname, '..');
const ARCHIVO_PID = path.join(__dirname, '.servidor-e2e.pid');

/**
 * Base dedicada a las pruebas: separada de la de desarrollo (misma instancia de SQL Server,
 * nombre distinto) para que correr la suite nunca borre ni mezcle datos de trabajo. La entidad
 * ideal seria un contenedor de base aparte; con uno solo disponible en este entorno, una base
 * distinta dentro de el es la version minima que sostiene el mismo objetivo de aislamiento.
 */
const DB_PRUEBAS = process.env.DB_NAME_E2E || 'CreditosPruebas';
const PUERTO_PRUEBAS = process.env.PORT_E2E || '3099';

/** Espera a que /api/health responda 200, o revienta si el servidor no arranco a tiempo. */
async function esperarSalud(url, intentosRestantes = 40) {
  for (let intento = 0; intento < intentosRestantes; intento += 1) {
    try {
      const respuesta = await fetch(`${url}/api/health`);
      if (respuesta.ok) return;
    } catch {
      // el servidor todavia no acepta conexiones
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  throw new Error('El servidor de pruebas no respondio en /api/health a tiempo.');
}

/**
 * Prepara todo lo que las pruebas de extremo a extremo necesitan antes del primer caso: la base
 * de datos migrada y sembrada, el build actualizado, y una instancia real de la API corriendo
 * (no un TestingModule en proceso) para que las pruebas ejerciten exactamente lo que main.ts
 * arma en produccion. `mssql` y `@nestjs/typeorm` no conviven bien con el cargador de modulos
 * de Jest (paquetes ESM-only con `import.meta`); evitar crear la app dentro de Jest sortea eso
 * de raiz en lugar de forzar una transformacion fragil.
 */
module.exports = async function globalSetup() {
  dotenv.config({ path: path.join(RAIZ_PROYECTO, '.env') });
  process.env.DB_NAME = DB_PRUEBAS;

  const env = { ...process.env, DB_NAME: DB_PRUEBAS };

  execSync('npm run migration:run', { cwd: CARPETA_API, env, stdio: 'inherit' });
  execSync('npm run seed', { cwd: CARPETA_API, env, stdio: 'inherit' });
  execSync('npm run build', { cwd: CARPETA_API, env, stdio: 'inherit' });

  const servidor = spawn('node', ['dist/main.js'], {
    cwd: CARPETA_API,
    env: { ...env, PORT: PUERTO_PRUEBAS },
    detached: true,
    stdio: 'inherit',
  });
  servidor.unref();
  fs.writeFileSync(ARCHIVO_PID, String(servidor.pid));

  process.env.API_URL_E2E = `http://localhost:${PUERTO_PRUEBAS}`;
  await esperarSalud(process.env.API_URL_E2E);
};
