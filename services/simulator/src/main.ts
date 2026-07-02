import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PORTS } from '@arena/contracts';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(Number(process.env.PORT ?? PORTS.simulator));
}

void bootstrap();
