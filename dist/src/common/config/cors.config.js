"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORS_CONFIG = void 0;
exports.CORS_CONFIG = {
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
//# sourceMappingURL=cors.config.js.map