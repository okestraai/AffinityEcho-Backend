// src/common/decorators/api-response.decorator.ts
import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export const ApiSuccessResponse = <T extends Type<any>>(type: T) =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Success',
      type,
    }),
  );

export const ApiCreatedResponse = <T extends Type<any>>(type: T) =>
  applyDecorators(
    ApiResponse({
      status: 201,
      description: 'Created',
      type,
    }),
  );
