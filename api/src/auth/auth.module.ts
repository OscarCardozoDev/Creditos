import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Credencial } from '../entidades/credencial.entidad';
import { Sesion } from '../entidades/sesion.entidad';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CredencialesRepository } from './credenciales.repository';
import { CsrfGuard } from './csrf.guard';
import { LimpiezaSesionesTarea } from './limpieza-sesiones.tarea';
import { RolesGuard } from './roles.guard';
import { SesionGuard } from './sesion.guard';
import { SesionesRepository } from './sesiones.repository';

/**
 * Registra los tres guards como globales y en este orden: primero se resuelve la sesion,
 * luego se comprueba el token anti-CSRF y por ultimo el rol.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Sesion, Credencial])],
  controllers: [AuthController],
  providers: [
    AuthService,
    SesionesRepository,
    CredencialesRepository,
    LimpiezaSesionesTarea,
    { provide: APP_GUARD, useClass: SesionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
