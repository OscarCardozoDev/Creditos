import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Publico } from './auth/decoradores';

@Controller('health')
export class AppController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Declara sana la API solo si la base responde: un proceso vivo sin base no puede atender. */
  @Publico()
  @Get()
  async salud() {
    await this.dataSource.query('SELECT 1');
    return { estado: 'ok', base: 'ok' };
  }
}
