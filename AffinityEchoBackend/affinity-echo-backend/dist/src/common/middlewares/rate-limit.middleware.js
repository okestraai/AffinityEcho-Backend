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
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_util_1 = __importDefault(require("../utils/logger.util"));
let RateLimitMiddleware = class RateLimitMiddleware {
    constructor() {
        this.limiter = (0, express_rate_limit_1.default)({
            windowMs: 1 * 60 * 1000,
            max: 100,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                const ip = req.ip || req.connection.remoteAddress || 'unknown';
                logger_util_1.default.info('Rate limit key generated', { ip, path: req.path });
                return ip;
            },
            handler: (req, res) => {
                const ip = req.ip || 'unknown';
                logger_util_1.default.warn('Rate limit exceeded', {
                    ip,
                    path: req.path,
                    method: req.method,
                });
                throw new common_1.HttpException('Too many requests from this IP. Please try again later.', common_1.HttpStatus.TOO_MANY_REQUESTS);
            },
        });
    }
    use(req, res, next) {
        this.limiter(req, res, next);
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)()
], RateLimitMiddleware);
//# sourceMappingURL=rate-limit.middleware.js.map