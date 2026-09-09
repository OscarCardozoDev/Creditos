import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import { FiltroExcepciones } from './comun/errores/filtro-excepciones';
import { InterceptorRegistro } from './comun/peticion/interceptor-registro';
import { InterceptorRespuesta } from './comun/peticion/interceptor-respuesta';

/**
 * Aplica el endurecimiento, la validacion y el formato de respuesta comunes a toda instancia
 * de la aplicacion. La usa tanto el arranque real (main.ts) como las pruebas de extremo a
 * extremo, para que estas ultimas ejerciten el mismo recorrido de peticion que produccion.
 */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // El receptor del webhook firma el cuerpo crudo; sin esto solo quedaria el JSON ya parseado.
  app.use(
    json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new InterceptorRegistro(), new InterceptorRespuesta());
  app.useGlobalFilters(new FiltroExcepciones());
}
