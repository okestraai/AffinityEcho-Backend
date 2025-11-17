import { ConfigService } from '@nestjs/config';
export declare const supabaseClient: (config: ConfigService) => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const supabaseAdmin: (config: ConfigService) => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
