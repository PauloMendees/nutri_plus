import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';
import { buildCorsOptions } from './cors.options';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(buildCorsOptions(process.env.WEB_ORIGIN));
  // The global ValidationPipe and exception filter are registered as providers
  // in AppModule (APP_PIPE / APP_FILTER) so every bootstrap path shares them.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
