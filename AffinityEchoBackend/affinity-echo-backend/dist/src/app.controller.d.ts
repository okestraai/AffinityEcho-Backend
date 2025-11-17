import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    root(): any;
    health(): {
        status: string;
        service: string;
        timestamp: string;
        uptime: number;
    };
}
