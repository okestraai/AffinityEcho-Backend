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
exports.LoggingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const logger_util_1 = __importDefault(require("../utils/logger.util"));
let LoggingInterceptor = class LoggingInterceptor {
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const { method, url, body, headers, ip, user } = request;
        const now = Date.now();
        const safeBody = { ...body };
        if (safeBody.password)
            safeBody.password = '***';
        if (safeBody.token)
            safeBody.token = '***';
        logger_util_1.default.info('Incoming request', {
            method,
            url,
            ip,
            userAgent: headers['user-agent'],
            userId: user?.sub || null,
            body: method !== 'GET' ? safeBody : undefined,
        });
        return next.handle().pipe((0, operators_1.tap)(() => {
            const response = context.switchToHttp().getResponse();
            const delay = Date.now() - now;
            const statusCode = response.statusCode;
            logger_util_1.default.info('Request completed', {
                method,
                url,
                statusCode,
                duration: `${delay}ms`,
                ip,
                userId: user?.sub || null,
            });
        }));
    }
};
exports.LoggingInterceptor = LoggingInterceptor;
exports.LoggingInterceptor = LoggingInterceptor = __decorate([
    (0, common_1.Injectable)()
], LoggingInterceptor);
//# sourceMappingURL=logger.middleware.js.map