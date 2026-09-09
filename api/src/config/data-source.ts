import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';

cargarEnv({ path: join(__dirname, '..', '..', '..', '.env') });

/** Opciones de conexion a SQL Server, compartidas por la aplicacion y por el CLI de migraciones. */
export const opcionesDataSource: DataSourceOptions = {
  type: 'mssql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  migrationsTransactionMode: 'each',
  entities: [join(__dirname, '..', 'entidades', '*.entidad.{ts,js}')],
  migrations: [join(__dirname, '..', 'migraciones', '*.{ts,js}')],
  // useUTC explicito: TypeORM lo pone en false por defecto para mssql si no se declara, y con
  // eso el driver interpreta cada datetime2 en la hora local del proceso, no en UTC. Autoconsistente
  // mientras la API corra siempre en un contenedor con el reloj del sistema en UTC (donde el
  // desfase es cero y el defecto pasa desapercibido), pero rompe el vencimiento de sesion en
  // cuanto la API corre en un host con otra zona horaria (`npm run start:dev` fuera de Docker,
  // que 01_entorno_local.md documenta como flujo valido): `expira_en` se lee corrido por el
  // desfase local y una sesion vencida deja de parecerlo. Invariante #10 exige UTC; esto lo hace
  // explicito en vez de depender de que el contenedor siempre este en UTC.
  options: { encrypt: false, trustServerCertificate: true, useUTC: true },
};

export default new DataSource(opcionesDataSource);
