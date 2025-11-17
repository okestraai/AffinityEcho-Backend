import { UserService } from '../services/user.service';
export declare class UserController {
    private userService;
    constructor(userService: UserService);
    getProfile(user: any): Promise<any>;
    updateProfile(user: any, updates: any): Promise<any>;
}
