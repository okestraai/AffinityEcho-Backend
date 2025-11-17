import { Type } from '@nestjs/common';
export declare const ApiSuccessResponse: <T extends Type<any>>(type: T) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare const ApiCreatedResponse: <T extends Type<any>>(type: T) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
