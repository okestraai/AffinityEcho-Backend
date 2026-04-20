// src/main.ts
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

// Load environment variables FIRST
expand(config());

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as swaggerUi from 'swagger-ui-express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logger.interceptor';
import { CORS_CONFIG } from './common/config/cors.config';
import logger from './common/utils/logger.util';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import type { Socket as EngineSocket } from 'engine.io';

// Custom WebSocket adapter with enhanced logging
class WebSocketAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    // super.createIOServer is untyped and may return `any`; assert via `unknown` first
    // to avoid a direct unsafe `any` assignment, then cast to the Socket.IO Server type.
    const server = super.createIOServer(port, {
      ...options,
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      cors: {
        origin: CORS_CONFIG.origin,
        credentials: CORS_CONFIG.credentials,
        methods: ['GET', 'POST'],
        allowedHeaders: CORS_CONFIG.allowedHeaders,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      allowEIO3: true, // Support older clients
    }) as unknown as import('socket.io').Server;
    // Enhanced WebSocket logging
    server.engine.on('connection', (rawSocket: EngineSocket) => {
      // transport.name is available, but `secure` isn't defined on Transport; infer security from the underlying request/socket
      const transportName = rawSocket.transport?.name;
      const isSecure = Boolean(
        // check socket.encrypted (TLS) or forwarded proto header
        (rawSocket.request &&
          (rawSocket.request as any).socket &&
          (rawSocket.request as any).socket.encrypted) ||
          (rawSocket.request &&
            (rawSocket.request as any).headers &&
            String(
              (rawSocket.request as any).headers['x-forwarded-proto'] || '',
            ).toLowerCase() === 'https'),
      );

      logger.info('🔌 Raw WebSocket connection established', {
        module: 'WebSocket',
        transport: transportName,
        secure: isSecure,
      });
    });

    server.engine.on('connection_error', (err: unknown) => {
      // Narrow the unknown error before accessing properties to avoid unsafe assignments
      const errorMessage =
        err && typeof err === 'object' && 'message' in err
          ? String((err as any).message)
          : String(err);
      const errorCode =
        err && typeof err === 'object' && 'code' in err
          ? (err as any).code
          : undefined;
      const errorContext =
        err && typeof err === 'object' && 'context' in err
          ? (err as any).context
          : undefined;

      logger.error('❌ WebSocket connection error:', {
        module: 'WebSocket',
        error: errorMessage,
        code: errorCode,
        context: errorContext,
      });
    });

    server.on('connection', (socket: import('socket.io').Socket) => {
      logger.info('✅ Socket.IO client connected:', {
        module: 'WebSocket',
        socketId: socket.id,
        transport: socket.conn.transport.name,
        handshake: {
          headers: {
            origin: socket.handshake.headers.origin,
            userAgent: socket.handshake.headers['user-agent'],
          },
          auth: socket.handshake.auth ? '✅ Present' : '❌ Missing',
          query: Object.keys(socket.handshake.query || {}),
        },
      });

      socket.on('error', (error) => {
        logger.error('❌ Socket error:', {
          module: 'WebSocket',
          socketId: socket.id,
          error: error.message,
        });
      });

      socket.on('disconnect', (reason) => {
        logger.info('👋 Socket disconnected:', {
          module: 'WebSocket',
          socketId: socket.id,
          reason,
        });
      });
    });

    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    snapshot: false,
  });

  // API VERSIONING
  app.setGlobalPrefix('api/v1');
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // COOKIE PARSER (required for CSRF)
  app.use(cookieParser());

  // SECURITY
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws://localhost:3000', 'wss://*'],
        },
      },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Permissions-Policy header (not in helmet)
  app.use((req: any, res: any, next: any) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    next();
  });

  // Enable CORS
  app.enableCors(CORS_CONFIG);

  // Log CORS configuration
  logger.info('🌐 CORS Configuration:', {
    module: 'Bootstrap',
    origins: CORS_CONFIG.origin,
    credentials: CORS_CONFIG.credentials,
    methods: CORS_CONFIG.methods,
  });

  // VALIDATION
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
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

  // Configure WebSocket adapter
  app.useWebSocketAdapter(new WebSocketAdapter(app));
  logger.info('🔌 WebSocket adapter configured', {
    module: 'Bootstrap',
    path: '/ws/socket.io',
  });

  // SWAGGER
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Affinity Echo API')
    .setDescription('The safest anonymous professional network')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(document));

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        http: 'running',
        websocket: 'running',
        cors: {
          origins: CORS_CONFIG.origin,
          credentials: CORS_CONFIG.credentials,
        },
      },
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // WebSocket info endpoint
  app.getHttpAdapter().get('/ws-info', (req, res) => {
    res.json({
      message: 'WebSocket configuration',
      endpoints: {
        websocket: 'ws://localhost:3000/ws/socket.io',
        health: 'http://localhost:3000/health',
        api: 'http://localhost:3000/api/v1',
      },
      cors: {
        origins: CORS_CONFIG.origin,
        methods: CORS_CONFIG.methods,
        credentials: CORS_CONFIG.credentials,
      },
      events: [
        'authenticate',
        'connected',
        'disconnected',
        'new_message',
        'message_sent',
        'message_error',
        'typing_start',
        'typing_end',
        'user_joined',
        'user_left',
        'join_conversation',
        'leave_conversation',
        'online_users',
        'ping',
        'pong',
      ],
    });
  });

  // Error handlers
  process.on('unhandledRejection', (reason: any) => {
    logger.error('Unhandled Rejection:', {
      reason: String(reason),
      module: 'Process',
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack,
      module: 'Process',
    });
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Log startup information
  console.log('\n' + '='.repeat(60));
  logger.info('🚀 SERVER STARTED SUCCESSFULLY', { module: 'Bootstrap' });
  console.log('='.repeat(60));
  logger.info(`📍 Port: ${port}`, { module: 'Bootstrap' });
  logger.info('📚 Swagger → http://localhost:3000/api/v1/docs', {
    module: 'Bootstrap',
  });
  logger.info('❤️  Health  → http://localhost:3000/health', {
    module: 'Bootstrap',
  });
  logger.info('🔌 WebSocket → ws://localhost:3000/ws/socket.io', {
    module: 'Bootstrap',
  });
  logger.info('📋 WS Info → http://localhost:3000/ws-info', {
    module: 'Bootstrap',
  });
  logger.info('🌐 CORS Origins:', {
    module: 'Bootstrap',
    origins: CORS_CONFIG.origin,
  });
  console.log('='.repeat(60) + '\n');
}

bootstrap();
