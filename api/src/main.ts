import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

/** Publica la documentacion interactiva. Nunca en produccion: es tambien un mapa de ataque. */
function configurarSwagger(app: Parameters<typeof SwaggerModule.createDocument>[0]): void {
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API de Creditos')
      .setDescription(
        'Solicitudes de credito para una entidad del sector financiero solidario: ' +
          'ciclo de vida de la solicitud, simulacion, historial y notificaciones a terceros.',
      )
      .setVersion('1.0')
      .addCookieAuth('__Host-sid', { type: 'apiKey', in: 'cookie', name: '__Host-sid' })
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
}

/** Arranca la API con el endurecimiento, la validacion y el formato de respuesta ya aplicados. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  if (process.env.NODE_ENV !== 'production') {
    configurarSwagger(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
