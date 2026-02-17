"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('CurrentUser');
exports.CurrentUser = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    logger.debug('CurrentUser decorator called');
    logger.debug('Request URL:', request.url);
    logger.debug('Request user object:', request.user);
    logger.debug('All request properties:', Object.keys(request));
    if (!request.user) {
        logger.error('❌ No user found in request - Auth guard may have failed');
        logger.error('Available request properties:', Object.keys(request));
        throw new common_1.UnauthorizedException('User not authenticated - check auth guard');
    }
    if (!request.user.sub) {
        logger.error('❌ User object missing sub property');
        logger.error('User object:', request.user);
        throw new common_1.UnauthorizedException('Invalid user object - missing sub property');
    }
    if (data) {
        logger.debug(`Extracting property: ${data}`);
        const value = request.user[data];
        if (value === undefined) {
            logger.warn(`Property ${data} not found in user object`);
        }
        return value;
    }
    logger.debug('Returning full user object');
    return request.user;
});
//# sourceMappingURL=current-user.decorator.js.map