export declare const getBullConfig: () => {
    connection: {
        host: string;
        port: number;
        password: string | undefined;
        db: number;
    };
    defaultJobOptions: {
        removeOnComplete: number;
        removeOnFail: number;
        attempts: number;
        backoff: {
            type: "exponential";
            delay: number;
        };
    };
};
