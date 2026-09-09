const fs = require('fs');
const path = require('path');

const ARCHIVO_PID = path.join(__dirname, '.servidor-e2e.pid');

/** Cierra el servidor de pruebas que globalSetup dejo corriendo en segundo plano. */
module.exports = async function globalTeardown() {
  if (!fs.existsSync(ARCHIVO_PID)) return;
  const pid = Number(fs.readFileSync(ARCHIVO_PID, 'utf8'));
  try {
    process.kill(pid);
  } catch {
    // ya estaba cerrado
  }
  fs.unlinkSync(ARCHIVO_PID);
};
