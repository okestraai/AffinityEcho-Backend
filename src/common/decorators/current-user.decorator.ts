import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

const logger = new Logger('CurrentUser');

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    logger.debug('CurrentUser decorator called');
    logger.debug('Request URL:', request.url);
    logger.debug('Request user object:', request.user);
    logger.debug('All request properties:', Object.keys(request));

    if (!request.user) {
      logger.error('❌ No user found in request - Auth guard may have failed');
      logger.error('Available request properties:', Object.keys(request));
      throw new UnauthorizedException(
        'User not authenticated - check auth guard',
      );
    }

    if (!request.user.sub) {
      logger.error('❌ User object missing sub property');
      logger.error('User object:', request.user);
      throw new UnauthorizedException(
        'Invalid user object - missing sub property',
      );
    }

    // If a specific property is requested (e.g., @CurrentUser('sub'))
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
  },
);
