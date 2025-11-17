// src/common/config/cors.config.ts
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const CORS_CONFIG: CorsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://affinity-echo.vercel.app',
    'https://affinityecho.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
};