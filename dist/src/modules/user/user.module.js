"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModule = void 0;
const common_1 = require("@nestjs/common");
const user_controller_1 = require("./controllers/user.controller");
const user_service_1 = require("./services/user.service");
const user_profile_service_1 = require("./services/user-profile.service");
const user_settings_service_1 = require("./services/user-settings.service");
const user_account_service_1 = require("./services/user-account.service");
const user_blocking_service_1 = require("./services/user-blocking.service");
const user_resources_service_1 = require("./services/user-resources.service");
const harassment_report_service_1 = require("./services/harassment-report.service");
const encryption_module_1 = require("../encryption/encryption.module");
const feeds_module_1 = require("../feeds/feeds.module");
let UserModule = class UserModule {
};
exports.UserModule = UserModule;
exports.UserModule = UserModule = __decorate([
    (0, common_1.Module)({
        imports: [encryption_module_1.EncryptionModule, feeds_module_1.FeedsModule],
        controllers: [user_controller_1.UserController],
        providers: [
            user_service_1.UserService,
            user_profile_service_1.UserProfileService,
            user_settings_service_1.UserSettingsService,
            user_account_service_1.UserAccountService,
            user_blocking_service_1.UserBlockingService,
            user_resources_service_1.UserResourcesService,
            harassment_report_service_1.HarassmentReportService,
        ],
        exports: [user_service_1.UserService, user_profile_service_1.UserProfileService],
    })
], UserModule);
//# sourceMappingURL=user.module.js.map