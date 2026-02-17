import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import logger from '../utils/logger.util';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 500, // Max 500 requests per IP per window

    // Security headers compliance
    standardHeaders: 'draft-7', // RFC compliant headers
    legacyHeaders: false, // Disable insecure headers

    // Key generator with IPv6 security
    keyGenerator: (req: Request): string => {
      // Security: Get real IP behind proxies
      let ip = this.getSecureClientIp(req);

      // Security: Normalize IPv6 addresses
      ip = this.normalizeIp(ip);

      // Security: Add user ID if authenticated (prevents IP sharing attacks)
      const userId = (req as any).user?.userId;
      if (userId) {
        return `user:${userId}:ip:${ip}`;
      }

      return ip;
    },

    // Security: Skip health checks and messaging endpoints
    skip: (req: Request): boolean => {
      // Skip rate limiting for health endpoints and messaging
      const skipPaths = [
        '/health',
        '/api/health',
        '/favicon.ico',
        '/api/v1/messaging/typing', // Skip typing status updates
        '/api/v1/notifications/unread-count', // Skip notification polling
        '/ws/socket.io', // Skip WebSocket connections
      ];
      return skipPaths.some((path) => req.path.includes(path));
    },

    // Security response
    handler: (req: Request, res: Response) => {
      const ip = this.getSecureClientIp(req);
      const normalizedIp = this.normalizeIp(ip);

      // Security logging
      logger.warn('RATE_LIMIT_SECURITY_EVENT', {
        event: 'RATE_LIMIT_EXCEEDED',
        ip: normalizedIp,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
        userId: (req as any).user?.userId || 'anonymous',
      });

      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');

      // Security response
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'Too many requests from this IP. Please try again in 15 minutes.',
          retryAfter: '15 minutes',
        },
        timestamp: new Date().toISOString(),
      });
    },

    // Security message
    message: 'Rate limit exceeded. Please try again later.',
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.limiter(req, res, next);
  }

  // Security: Proper IP extraction
  private getSecureClientIp(req: Request): string {
    // Check proxy headers first
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];

    if (forwardedFor) {
      // Get first IP in X-Forwarded-For chain
      const ips = String(forwardedFor).split(',');
      return ips[0].trim();
    }

    if (realIp) {
      return String(realIp);
    }

    // Fallback to Express IP
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  // Security: Normalize IP addresses
  private normalizeIp(ip: string): string {
    if (!ip || ip === 'unknown') return 'unknown';

    // Remove IPv6 prefix for IPv4 addresses
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    // Remove port
    const hasPort = ip.includes(':') && !ip.includes('[');
    if (hasPort) {
      ip = ip.split(':')[0];
    }

    return ip;
  }
}
