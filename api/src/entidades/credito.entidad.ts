import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { EstadoCredito, FormaPago, listaSql, TipoCredito } from './enums';
import { decimalATexto } from './transformadores';
import { Usuario } from './usuario.entidad';

@Entity('Creditos')
@Unique('UQ_Creditos_Numero', ['numCredito'])
@Index('IX_Creditos_Estado_Fecha', ['estado', 'fechaSolicitud'], { where: 'eliminado_en IS NULL' })
@Index('IX_Creditos_Deudor', ['deudorId'], { where: 'eliminado_en IS NULL' })
@Index('UX_Creditos_Duplicado', ['deudorId', 'tipoCredito', 'valorSolicitado'], {
  unique: true,
  where: `estado IN ('${EstadoCredito.SOLICITADO}','${EstadoCredito.EN_ESTUDIO}') AND eliminado_en IS NULL`,
})
@Check('CK_Creditos_Tipo', `tipo_credito IN (${listaSql(TipoCredito)})`)
@Check('CK_Creditos_Forma', `forma_pago IN (${listaSql(FormaPago)})`)
@Check('CK_Creditos_Estado', `estado IN (${listaSql(EstadoCredito)})`)
@Check('CK_Creditos_Valor', 'valor_solicitado > 0')
@Check('CK_Creditos_Tasa', 'tasa_interes >= 0')
@Check('CK_Creditos_Cuotas', 'num_cuotas > 0')
export class Credito {
  @PrimaryGeneratedColumn('uuid', { name: 'credito_id', primaryKeyConstraintName: 'PK_Creditos' })
  creditoId: string;

  /** Formato CR-{anio}-{consecutivo de 6 digitos}; el consecutivo sale de Seq_NumCredito. */
  @Column({ name: 'num_credito', type: 'varchar', length: 20 })
  numCredito: string;

  @Column({ name: 'deudor_id', type: 'uniqueidentifier' })
  deudorId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'deudor_id', foreignKeyConstraintName: 'FK_Creditos_Deudor' })
  deudor: Usuario;

  @Column({ name: 'tipo_credito', type: 'varchar', length: 20 })
  tipoCredito: TipoCredito;

  @Column({ name: 'valor_solicitado', type: 'decimal', precision: 18, scale: 2, transformer: decimalATexto })
  valorSolicitado: string;

  /** Tasa mensual vencida. Seis decimales: redondear a dos cambia el valor de la cuota. */
  @Column({ name: 'tasa_interes', type: 'decimal', precision: 9, scale: 6, transformer: decimalATexto })
  tasaInteres: string;

  @Column({ name: 'num_cuotas', type: 'int' })
  numCuotas: number;

  @Column({ name: 'forma_pago', type: 'varchar', length: 20 })
  formaPago: FormaPago;

  @Column({ name: 'estado', type: 'varchar', length: 15, default: () => `'${EstadoCredito.SOLICITADO}'` })
  estado: EstadoCredito;

  @Column({ name: 'fecha_solicitud', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  fechaSolicitud: Date;

  @Column({ name: 'fecha_actualizacion', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  fechaActualizacion: Date;

  /** Borrado logico. Es un hecho administrativo, no un estado del credito. */
  @Column({ name: 'eliminado_en', type: 'datetime2', precision: 3, nullable: true })
  eliminadoEn: Date | null;

  /** La incrementa el motor en cada escritura; el control optimista se hace explicito en el UPDATE. */
  @Column({ name: 'row_version', type: 'rowversion', insert: false, update: false })
  rowVersion: Buffer;
}
