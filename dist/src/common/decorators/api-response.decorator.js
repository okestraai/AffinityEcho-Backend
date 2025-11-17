"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiCreatedResponse = exports.ApiSuccessResponse = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ApiSuccessResponse = (type) => (0, common_1.applyDecorators)((0, swagger_1.ApiResponse)({
    status: 200,
    description: 'Success',
    type,
}));
exports.ApiSuccessResponse = ApiSuccessResponse;
const ApiCreatedResponse = (type) => (0, common_1.applyDecorators)((0, swagger_1.ApiResponse)({
    status: 201,
    description: 'Created',
    type,
}));
exports.ApiCreatedResponse = ApiCreatedResponse;
//# sourceMappingURL=api-response.decorator.js.map