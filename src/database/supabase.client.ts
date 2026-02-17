import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export const supabaseClient = (config: ConfigService) => {
  const url = config.get<string>('SUPABASE_URL');
  const anonKey = config.get<string>('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error(
      `Missing Supabase configuration: URL=${!!url}, ANON_KEY=${!!anonKey}`,
    );
  }

  return createClient(url, anonKey);
};

export const supabaseAdmin = (config: ConfigService) => {
  const url = config.get<string>('SUPABASE_URL');
  const serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = config.get<string>('SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error('SUPABASE_URL is not configured');
  }

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  if (!serviceKey.startsWith('eyJ')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT token. ' +
      'Make sure you copied the service_role key from Supabase Dashboard → Project Settings → API'
    );
  }

  if (serviceKey === anonKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY cannot be the same as SUPABASE_ANON_KEY. ' +
      'Please use the actual service_role key from your Supabase dashboard.'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
