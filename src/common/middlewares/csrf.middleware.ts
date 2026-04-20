import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * How it works:
 * 1. On every response, set a `XSRF-TOKEN` cookie (readable by JS, NOT httpOnly)
 * 2. Frontend reads the cookie and sends it back as `X-XSRF-TOKEN` header
 * 3. On state-changing requests (POST/PUT/PATCH/DELETE), validate header matches cookie
 *
 * Skipped for:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Requests with Bearer token (mobile clients — no cookies = no CSRF risk)
 * - Webhook endpoints
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Always set/refresh the XSRF-TOKEN cookie so frontend can read it
    const existingToken = req.cookies?.['XSRF-TOKEN'];
    const csrfToken = existingToken || crypto.randomBytes(32).toString('hex');

    if (!existingToken) {
      res.cookie('XSRF-TOKEN', csrfToken, {
        httpOnly: false, // Frontend must read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });
    }

    // Only validate on state-changing methods
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    // Skip CSRF for Bearer-authenticated requests (mobile)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // Skip CSRF for requests without cookies (API clients)
    if (!req.cookies || !req.cookies['XSRF-TOKEN']) {
      return next();
    }

    // Validate: X-XSRF-TOKEN header must match XSRF-TOKEN cookie
    const headerToken = req.headers['x-xsrf-token'] as string;
    const cookieToken = req.cookies['XSRF-TOKEN'];

    if (!headerToken || headerToken !== cookieToken) {
      res.status(403).json({
        statusCode: 403,
        message: 'Invalid CSRF token',
        error: 'Forbidden',
      });
      return;
    }

    next();
  }
}
