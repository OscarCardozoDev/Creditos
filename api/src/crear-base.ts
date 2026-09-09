import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { opcionesDataSource } from './config/data-source';

/** Crea la base si no existe: TypeORM no puede conectarse a una base inexistente para migrarla. */
async function crearBase() {
  const nombre = process.env.DB_NAME as string;
  const maestra = new DataSource({
    ...opcionesDataSource,
    database: 'master',
    entities: [],
    migrations: [],
  } as DataSourceOptions);
  await maestra.initialize();
  await maestra.query(`IF DB_ID('${nombre}') IS NULL CREATE DATABASE [${nombre}]`);
  await maestra.destroy();
  console.log(`Base ${nombre} lista.`);
}

void crearBase();
