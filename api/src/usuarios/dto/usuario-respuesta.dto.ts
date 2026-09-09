import { ApiProperty } from '@nestjs/swagger';
import { TipoPersona, TipoUsuario } from '../../entidades/enums';
import { Usuario } from '../../entidades/usuario.entidad';

/** Lo que del usuario cruza al cliente. La entidad nunca se serializa tal cual. */
export class UsuarioRespuestaDto {
  @ApiProperty() usuarioId: string;
  @ApiProperty() identificacion: string;
  @ApiProperty() nombreRazonSocial: string;
  @ApiProperty({ enum: TipoPersona }) tipoPersona: TipoPersona;
  @ApiProperty({ enum: TipoUsuario }) tipoUsuario: TipoUsuario;
  @ApiProperty() activo: boolean;
  @ApiProperty() creadoEn: Date;

  /** Proyecta la entidad al contrato publico, dejando fuera lo que no le corresponde al cliente. */
  static de(usuario: Usuario): UsuarioRespuestaDto {
    return {
      usuarioId: usuario.usuarioId,
      identificacion: usuario.identificacion,
      nombreRazonSocial: usuario.nombreRazonSocial,
      tipoPersona: usuario.tipoPersona,
      tipoUsuario: usuario.tipoUsuario,
      activo: usuario.activo,
      creadoEn: usuario.creadoEn,
    };
  }
}
