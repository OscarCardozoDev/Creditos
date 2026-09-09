import { ApiProperty } from '@nestjs/swagger';
import { Sesion } from '../../entidades/sesion.entidad';

/** Lo que se muestra de una sesion en el listado de dispositivos. El token nunca sale. */
export class SesionRespuestaDto {
  @ApiProperty() id: string;
  @ApiProperty() creadaEn: Date;
  @ApiProperty() ultimoAcceso: Date;
  @ApiProperty() expiraEn: Date;
  @ApiProperty({ nullable: true }) ip: string | null;
  @ApiProperty({ nullable: true }) agenteUsuario: string | null;
  @ApiProperty() esLaActual: boolean;

  /** Proyecta la sesion al contrato publico y marca cual es la que hizo la peticion. */
  static de(sesion: Sesion, tokenHashActual: string): SesionRespuestaDto {
    return {
      id: sesion.tokenHash,
      creadaEn: sesion.creadaEn,
      ultimoAcceso: sesion.ultimoAcceso,
      expiraEn: sesion.expiraEn,
      ip: sesion.ip,
      agenteUsuario: sesion.agenteUsuario,
      esLaActual: sesion.tokenHash === tokenHashActual,
    };
  }
}
