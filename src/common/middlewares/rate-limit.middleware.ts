// src/common/middleware/rate-limit.middleware.ts
import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.util';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use the built-in IP handling that properly supports IPv6
      const ip = req.ip || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req as any).connection?.socket?.remoteAddress || 
                 'unknown';
      
      // Normalize IPv6 addresses (convert ::ffff:192.168.1.1 to 192.168.1.1)
      const normalizedIp = ip.includes('::ffff:') ? ip.split('::ffff:')[1] : ip;
      
      logger.info('Rate limit key generated', { ip: normalizedIp, path: req.path });
      return normalizedIp;
    },
    handler: (req: Request, res: Response) => {
      const ip = req.ip || 'unknown';
      logger.warn('Rate limit exceeded', {
        ip,
        path: req.path,
        method: req.method,
      });
      throw new HttpException(
        'Too many requests from this IP. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    },
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.limiter(req, res, next);
  }
}