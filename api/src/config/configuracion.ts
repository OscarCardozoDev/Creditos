import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, validateSync } from 'class-validator';

/** Variables de entorno que la aplicacion exige para arrancar. */
export class Configuracion {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  @IsString()
  @IsNotEmpty()
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  SESSION_COOKIE_NAME: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_INACTIVIDAD_MIN: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_ABSOLUTA_HORAS: number;

  @IsString()
  @IsNotEmpty()
  WEBHOOK_URL: string;

  @IsString()
  @IsNotEmpty()
  WEBHOOK_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WEBHOOK_TIMEOUT_MS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WEBHOOK_MAX_INTENTOS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_INTERVALO_MS: number;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;
}

/** Valida el entorno al arrancar y detiene el proceso si falta o sobra algo obligatorio. */
export function validarConfiguracion(entorno: Record<string, unknown>): Configuracion {
  const config = plainToInstance(Configuracion, entorno, {
    enableImplicitConversion: false,
  });
  const errores = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
  });
  if (errores.length) {
    const detalle = errores.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
    throw new Error(`Configuracion invalida:\n  ${detalle.join('\n  ')}`);
  }
  return config;
}
