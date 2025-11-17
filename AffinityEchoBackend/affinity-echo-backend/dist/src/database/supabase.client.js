"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseClient = (config) => (0, supabase_js_1.createClient)(config.get('SUPABASE_URL'), config.get('SUPABASE_ANON_KEY'));
exports.supabaseClient = supabaseClient;
const supabaseAdmin = (config) => (0, supabase_js_1.createClient)(config.get('SUPABASE_URL'), config.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
exports.supabaseAdmin = supabaseAdmin;
//# sourceMappingURL=supabase.client.js.map