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
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./modules/auth/auth.module");
const user_module_1 = require("./modules/user/user.module");
const forum_module_1 = require("./modules/forum/forum.module");
const rate_limit_middleware_1 = require("./common/middlewares/rate-limit.middleware");
const encryption_util_1 = require("./common/utils/encryption.util");
const configuration_1 = __importDefault(require("./config/configuration"));
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const encryption_module_1 = require("./modules/encryption/encryption.module");
const nooks_module_1 = require("./modules/nooks/nooks.module");
const mentorship_module_1 = require("./modules/mentorship/mentorship.module");
const referral_module_1 = require("./modules/referral/referral.module");
const messaging_module_1 = require("./modules/messaging/messaging.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const feeds_module_1 = require("./modules/feeds/feeds.module");
const admin_module_1 = require("./modules/admin/admin.module");
const redis_module_1 = require("./common/services/redis.module");
const bullmq_1 = require("@nestjs/bullmq");
const bull_config_1 = require("./config/bull.config");
const schedule_1 = require("@nestjs/schedule");
const nook_cron_jobs_1 = require("./jobs/nook-cron.jobs");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(rate_limit_middleware_1.RateLimitMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
                load: [configuration_1.default],
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    name: 'default',
                    ttl: 60000,
                    limit: 300,
                },
                {
                    name: 'messaging',
                    ttl: 10000,
                    limit: 50,
                },
            ]),
            bullmq_1.BullModule.forRoot((0, bull_config_1.getBullConfig)()),
            schedule_1.ScheduleModule.forRoot(),
            redis_module_1.RedisModule,
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            forum_module_1.ForumModule,
            nooks_module_1.NooksModule,
            mentorship_module_1.MentorshipModule,
            referral_module_1.ReferralModule,
            encryption_module_1.EncryptionModule,
            messaging_module_1.MessagingModule,
            notifications_module_1.NotificationsModule,
            feeds_module_1.FeedsModule,
            admin_module_1.AdminModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            encryption_util_1.EncryptionUtil,
            nook_cron_jobs_1.NookCronJobs,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map