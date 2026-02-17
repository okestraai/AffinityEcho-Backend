"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const dotenv_expand_1 = require("dotenv-expand");
(0, dotenv_expand_1.expand)((0, dotenv_1.config)());
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const swaggerUi = __importStar(require("swagger-ui-express"));
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const logger_interceptor_1 = require("./common/interceptors/logger.interceptor");
const cors_config_1 = require("./common/config/cors.config");
const logger_util_1 = __importDefault(require("./common/utils/logger.util"));
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
class WebSocketAdapter extends platform_socket_io_1.IoAdapter {
    createIOServer(port, options) {
        const server = super.createIOServer(port, {
            ...options,
            path: '/ws/socket.io',
            transports: ['websocket', 'polling'],
            cors: {
                origin: cors_config_1.CORS_CONFIG.origin,
                credentials: cors_config_1.CORS_CONFIG.credentials,
                methods: ['GET', 'POST'],
                allowedHeaders: cors_config_1.CORS_CONFIG.allowedHeaders,
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            connectTimeout: 45000,
            allowEIO3: true,
        });
        server.engine.on('connection', (rawSocket) => {
            const transportName = rawSocket.transport?.name;
            const isSecure = Boolean((rawSocket.request &&
                rawSocket.request.socket &&
                rawSocket.request.socket.encrypted) ||
                (rawSocket.request &&
                    rawSocket.request.headers &&
                    String(rawSocket.request.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'));
            logger_util_1.default.info('🔌 Raw WebSocket connection established', {
                module: 'WebSocket',
                transport: transportName,
                secure: isSecure,
            });
        });
        server.engine.on('connection_error', (err) => {
            const errorMessage = err && typeof err === 'object' && 'message' in err
                ? String(err.message)
                : String(err);
            const errorCode = err && typeof err === 'object' && 'code' in err
                ? err.code
                : undefined;
            const errorContext = err && typeof err === 'object' && 'context' in err
                ? err.context
                : undefined;
            logger_util_1.default.error('❌ WebSocket connection error:', {
                module: 'WebSocket',
                error: errorMessage,
                code: errorCode,
                context: errorContext,
            });
        });
        server.on('connection', (socket) => {
            logger_util_1.default.info('✅ Socket.IO client connected:', {
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
                logger_util_1.default.error('❌ Socket error:', {
                    module: 'WebSocket',
                    socketId: socket.id,
                    error: error.message,
                });
            });
            socket.on('disconnect', (reason) => {
                logger_util_1.default.info('👋 Socket disconnected:', {
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
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: false,
        snapshot: false,
    });
    app.setGlobalPrefix('api/v1');
    app.enableVersioning({
        type: common_1.VersioningType.URI,
    });
    app.use((0, helmet_1.default)({
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
    }));
    app.enableCors(cors_config_1.CORS_CONFIG);
    logger_util_1.default.info('🌐 CORS Configuration:', {
        module: 'Bootstrap',
        origins: cors_config_1.CORS_CONFIG.origin,
        credentials: cors_config_1.CORS_CONFIG.credentials,
        methods: cors_config_1.CORS_CONFIG.methods,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
    }));
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new logger_interceptor_1.LoggingInterceptor(), new transform_interceptor_1.TransformInterceptor());
    app.useWebSocketAdapter(new WebSocketAdapter(app));
    logger_util_1.default.info('🔌 WebSocket adapter configured', {
        module: 'Bootstrap',
        path: '/ws/socket.io',
    });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Affinity Echo API')
        .setDescription('The safest anonymous professional network')
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(document));
    app.getHttpAdapter().get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                http: 'running',
                websocket: 'running',
                cors: {
                    origins: cors_config_1.CORS_CONFIG.origin,
                    credentials: cors_config_1.CORS_CONFIG.credentials,
                },
            },
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
        });
    });
    app.getHttpAdapter().get('/ws-info', (req, res) => {
        res.json({
            message: 'WebSocket configuration',
            endpoints: {
                websocket: 'ws://localhost:3000/ws/socket.io',
                health: 'http://localhost:3000/health',
                api: 'http://localhost:3000/api/v1',
            },
            cors: {
                origins: cors_config_1.CORS_CONFIG.origin,
                methods: cors_config_1.CORS_CONFIG.methods,
                credentials: cors_config_1.CORS_CONFIG.credentials,
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
    process.on('unhandledRejection', (reason) => {
        logger_util_1.default.error('Unhandled Rejection:', {
            reason: String(reason),
            module: 'Process',
        });
    });
    process.on('uncaughtException', (error) => {
        logger_util_1.default.error('Uncaught Exception:', {
            error: error.message,
            stack: error.stack,
            module: 'Process',
        });
    });
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log('\n' + '='.repeat(60));
    logger_util_1.default.info('🚀 SERVER STARTED SUCCESSFULLY', { module: 'Bootstrap' });
    console.log('='.repeat(60));
    logger_util_1.default.info(`📍 Port: ${port}`, { module: 'Bootstrap' });
    logger_util_1.default.info('📚 Swagger → http://localhost:3000/api/v1/docs', {
        module: 'Bootstrap',
    });
    logger_util_1.default.info('❤️  Health  → http://localhost:3000/health', {
        module: 'Bootstrap',
    });
    logger_util_1.default.info('🔌 WebSocket → ws://localhost:3000/ws/socket.io', {
        module: 'Bootstrap',
    });
    logger_util_1.default.info('📋 WS Info → http://localhost:3000/ws-info', {
        module: 'Bootstrap',
    });
    logger_util_1.default.info('🌐 CORS Origins:', {
        module: 'Bootstrap',
        origins: cors_config_1.CORS_CONFIG.origin,
    });
    console.log('='.repeat(60) + '\n');
}
bootstrap();
//# sourceMappingURL=main.js.map