import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventosWebhookRecibidos1788896467107 implements MigrationInterface {
  name = 'EventosWebhookRecibidos1788896467107';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "EventosWebhookRecibidos" ("event_id" uniqueidentifier NOT NULL, "recibido_en" datetime2(3) NOT NULL CONSTRAINT "DF_3a845bc42d0371b37fc532e4405" DEFAULT SYSUTCDATETIME(), CONSTRAINT "PK_EventosWebhookRecibidos" PRIMARY KEY ("event_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "EventosWebhookRecibidos"`);
  }
}
