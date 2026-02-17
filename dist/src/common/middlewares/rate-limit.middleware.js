"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitMiddleware = void 0;
const common_1 = require("@nestjs/common");
const express_rate_limit_1 = require("express-rate-limit");
const logger_util_1 = __importDefault(require("../utils/logger.util"));
let RateLimitMiddleware = class RateLimitMiddleware {
    constructor() {
        this.limiter = (0, express_rate_limit_1.rateLimit)({
            windowMs: 15 * 60 * 1000,
            limit: 500,
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            keyGenerator: (req) => {
                let ip = this.getSecureClientIp(req);
                ip = this.normalizeIp(ip);
                const userId = req.user?.userId;
                if (userId) {
                    return `user:${userId}:ip:${ip}`;
                }
                return ip;
            },
            skip: (req) => {
                const skipPaths = [
                    '/health',
                    '/api/health',
                    '/favicon.ico',
                    '/api/v1/messaging/typing',
                    '/api/v1/notifications/unread-count',
                    '/ws/socket.io',
                ];
                return skipPaths.some((path) => req.path.includes(path));
            },
            handler: (req, res) => {
                const ip = this.getSecureClientIp(req);
                const normalizedIp = this.normalizeIp(ip);
                logger_util_1.default.warn('RATE_LIMIT_SECURITY_EVENT', {
                    event: 'RATE_LIMIT_EXCEEDED',
                    ip: normalizedIp,
                    path: req.path,
                    method: req.method,
                    userAgent: req.headers['user-agent'],
                    timestamp: new Date().toISOString(),
                    userId: req.user?.userId || 'anonymous',
                });
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('X-Frame-Options', 'DENY');
                res.setHeader('X-XSS-Protection', '1; mode=block');
                res.status(429).json({
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests from this IP. Please try again in 15 minutes.',
                        retryAfter: '15 minutes',
                    },
                    timestamp: new Date().toISOString(),
                });
            },
            message: 'Rate limit exceeded. Please try again later.',
        });
    }
    use(req, res, next) {
        this.limiter(req, res, next);
    }
    getSecureClientIp(req) {
        const forwardedFor = req.headers['x-forwarded-for'];
        const realIp = req.headers['x-real-ip'];
        if (forwardedFor) {
            const ips = String(forwardedFor).split(',');
            return ips[0].trim();
        }
        if (realIp) {
            return String(realIp);
        }
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }
    normalizeIp(ip) {
        if (!ip || ip === 'unknown')
            return 'unknown';
        if (ip.startsWith('::ffff:')) {
            ip = ip.substring(7);
        }
        const hasPort = ip.includes(':') && !ip.includes('[');
        if (hasPort) {
            ip = ip.split(':')[0];
        }
        return ip;
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)()
], RateLimitMiddleware);
//# sourceMappingURL=rate-limit.middleware.js.map