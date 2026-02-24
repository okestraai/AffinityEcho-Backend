// src/common/config/cors.config.ts
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// Production origins
const productionOrigins: string[] = [
  'https://affinityecho.com',
  'https://www.affinityecho.com',
  'https://app.affinityecho.com',
  'https://affinity-echo.vercel.app',
];

// Development origins (only included when not in production)
const devOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
];

const origins =
  process.env.NODE_ENV === 'production'
    ? productionOrigins
    : [...productionOrigins, ...devOrigins];

export const CORS_CONFIG: CorsOptions = {
  origin: origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Origin', // ADD THIS - it's required for WebSocket
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
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
