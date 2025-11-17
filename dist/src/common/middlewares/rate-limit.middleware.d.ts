import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export declare class RateLimitMiddleware implements NestMiddleware {
    private limiter;
    use(req: Request, res: Response, next: NextFunction): void;
}
