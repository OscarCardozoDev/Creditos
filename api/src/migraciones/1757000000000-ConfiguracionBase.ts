import { MigrationInterface, QueryRunner } from 'typeorm';

/** Aplica lo que ningun decorador expresa: instantaneas de lectura y la secuencia del numero de credito. */
export class ConfiguracionBase1757000000000 implements MigrationInterface {
  /** ALTER DATABASE no se admite dentro de una transaccion de usuario. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const base = queryRunner.connection.options.database as string;
    await queryRunner.query(`ALTER DATABASE [${base}] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE`);
    await queryRunner.query(
      `IF OBJECT_ID('dbo.Seq_NumCredito') IS NULL CREATE SEQUENCE dbo.Seq_NumCredito AS INT START WITH 1 INCREMENT BY 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const base = queryRunner.connection.options.database as string;
    await queryRunner.query(`DROP SEQUENCE IF EXISTS dbo.Seq_NumCredito`);
    await queryRunner.query(`ALTER DATABASE [${base}] SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE`);
  }
}
