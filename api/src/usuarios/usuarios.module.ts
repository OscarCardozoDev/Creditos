import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Usuario } from '../entidades/usuario.entidad';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
