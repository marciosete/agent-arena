import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PORTS } from '@arena/contracts';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(PORTS.pricing);
}

void bootstrap();
