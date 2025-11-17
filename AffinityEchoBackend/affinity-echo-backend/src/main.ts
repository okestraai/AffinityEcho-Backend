// src/main.ts
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

// Load environment variables FIRST
expand(config());

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as swaggerUi from 'swagger-ui-express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logger.interceptor';
import { CORS_CONFIG } from './common/config/cors.config';
import logger from './common/utils/logger.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });

  // SECURITY
  app.use(helmet());
  app.enableCors(CORS_CONFIG);

  // VALIDATION
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  // GLOBAL FILTERS
  app.useGlobalFilters(new AllExceptionsFilter());

  // GLOBAL INTERCEPTORS
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // SWAGGER — USING swagger-ui-express (DEFAULT UI)
  const config = new DocumentBuilder()
    .setTitle('Affinity Echo API')
    .setDescription('The safest anonymous professional network on Earth — Built in Lagos')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Use default Swagger UI without custom CSS
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(document));

  await app.listen(3000);

  logger.info('FORTRESS LIVE ON PORT 3000', { module: 'Bootstrap' });
  logger.info('SWAGGER → http://localhost:3000/docs', { module: 'Bootstrap' });
  logger.info('HEALTH  → http://localhost:3000/health', { module: 'Bootstrap' });
}
bootstrap();