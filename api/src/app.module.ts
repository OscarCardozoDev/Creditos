import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CreditosModule } from './creditos/creditos.module';
import { SimulacionModule } from './simulacion/simulacion.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { validarConfiguracion } from './config/configuracion';
import { RequestIdMiddleware } from './comun/peticion/request-id.middleware';
import { opcionesDataSource } from './config/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env', validate: validarConfiguracion }),
    TypeOrmModule.forRoot(opcionesDataSource),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    AuthModule,
    CreditosModule,
    SimulacionModule,
    UsuariosModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  /** Aplica el identificador de peticion antes que cualquier otra cosa del recorrido. */
  configure(consumer: MiddlewareConsumer) {
    // Express 5 exige el parametro con nombre: '*' a secas queda obsoleto y Nest avisa al arrancar.
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
