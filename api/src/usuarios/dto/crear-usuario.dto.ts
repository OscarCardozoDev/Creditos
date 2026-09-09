import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { TipoPersona, TipoUsuario } from '../../entidades/enums';

/**
 * Largo minimo de la contrasena. Un minimo corto no lo compensa ningun algoritmo de hash:
 * argon2 encarece cada intento, no reduce el numero de contrasenas posibles.
 */
export const LARGO_MINIMO_PASSWORD = 12;

/** Datos con los que se registra un usuario. Ni el rol ni la identificacion cambian despues. */
export class CrearUsuarioDto {
  @ApiProperty({ example: '1001234567' })
  @IsString()
  @Length(5, 20)
  @Matches(/^[0-9A-Za-z-]+$/, { message: 'identificacion admite digitos, letras y guiones' })
  identificacion: string;

  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @Length(3, 150)
  nombreRazonSocial: string;

  @ApiProperty({ enum: TipoPersona })
  @IsEnum(TipoPersona)
  tipoPersona: TipoPersona;

  @ApiProperty({ enum: TipoUsuario })
  @IsEnum(TipoUsuario)
  tipoUsuario: TipoUsuario;

  @ApiPropertyOptional({
    example: 'analista@local',
    description: 'Con correo y password el usuario puede entrar. Sin ellos queda solo como deudor',
  })
  @IsOptional()
  // require_tld en falso: los correos del entorno local son admin@local, analista@local...
  @IsEmail({ require_tld: false }, { message: 'correo debe ser una direccion valida' })
  @Length(5, 254)
  correo?: string;

  @ApiPropertyOptional({ minLength: LARGO_MINIMO_PASSWORD, description: 'No se persiste en claro ni aparece en logs' })
  @IsOptional()
  @IsString()
  @Length(LARGO_MINIMO_PASSWORD, 128)
  password?: string;
}
