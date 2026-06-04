import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Builds the OpenAPI document and mounts Swagger UI at /docs (raw JSON at
// /docs-json). Shared by main.ts and the docs e2e so both produce the same spec.
// Call AFTER app.enableVersioning() so route paths carry their /v1 prefix.
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Nutri Plus API')
    .setDescription('Nutritionist SaaS backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
