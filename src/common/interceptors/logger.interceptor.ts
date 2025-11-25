// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import logger from '../utils/logger.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip, headers, user } = req;
    const now = Date.now();

    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '***';
    if (safeBody.token) safeBody.token = '***';

    logger.info('Incoming request', {
      method,
      url,
      ip,
      userAgent: headers['user-agent'],
      userId: user?.sub || null,
      body: method !== 'GET' ? safeBody : undefined,
    });

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const delay = Date.now() - now;
        logger.info('Request completed', {
          method,
          url,
          statusCode: res.statusCode,
          duration: `${delay}ms`,
          ip,
        });
      }),
    );
  }
}
