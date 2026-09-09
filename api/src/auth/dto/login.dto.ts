import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

/** Credenciales con las que se pide abrir una sesion. */
export class LoginDto {
  @ApiProperty({ example: 'analista@local' })
  // require_tld en falso: los correos del entorno local son admin@local, analista@local...
  @IsEmail({ require_tld: false }, { message: 'correo debe ser una direccion valida' })
  correo: string;

  @ApiProperty({ example: 'Desarrollo.2026' })
  @IsString()
  @Length(8, 128)
  password: string;
}
