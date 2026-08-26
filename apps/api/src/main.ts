import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { API_PORT, WEB_ORIGINS } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: { origin: WEB_ORIGINS, credentials: true },
  });

  app.enableShutdownHooks();

  await app.listen(API_PORT);
  Logger.log(
    `Punchline API listening on http://localhost:${API_PORT} (allowed origins: ${WEB_ORIGINS.join(', ')})`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, 'Bootstrap');
  process.exit(1);
});
