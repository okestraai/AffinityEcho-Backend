"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORS_CONFIG = void 0;
const productionOrigins = [
    'https://affinityecho.com',
    'https://www.affinityecho.com',
    'https://app.affinityecho.com',
    'https://staging-app.affinityecho.com',
    'https://affinity-echo.vercel.app',
];
const devOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
];
const origins = process.env.NODE_ENV === 'production'
    ? productionOrigins
    : [...productionOrigins, ...devOrigins];
exports.CORS_CONFIG = {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Origin',
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Credentials',
    ],
    exposedHeaders: [
        'Authorization',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials',
    ],
    credentials: true,
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
};
//# sourceMappingURL=cors.config.js.map