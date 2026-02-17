"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseClient = (config) => {
    const url = config.get('SUPABASE_URL');
    const anonKey = config.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) {
        throw new Error(`Missing Supabase configuration: URL=${!!url}, ANON_KEY=${!!anonKey}`);
    }
    return (0, supabase_js_1.createClient)(url, anonKey);
};
exports.supabaseClient = supabaseClient;
const supabaseAdmin = (config) => {
    const url = config.get('SUPABASE_URL');
    const serviceKey = config.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = config.get('SUPABASE_ANON_KEY');
    if (!url) {
        throw new Error('SUPABASE_URL is not configured');
    }
    if (!serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    if (!serviceKey.startsWith('eyJ')) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT token. ' +
            'Make sure you copied the service_role key from Supabase Dashboard → Project Settings → API');
    }
    if (serviceKey === anonKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY cannot be the same as SUPABASE_ANON_KEY. ' +
            'Please use the actual service_role key from your Supabase dashboard.');
    }
    return (0, supabase_js_1.createClient)(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};
exports.supabaseAdmin = supabaseAdmin;
//# sourceMappingURL=supabase.client.js.map