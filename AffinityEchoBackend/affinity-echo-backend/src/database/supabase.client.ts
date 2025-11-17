// src/database/supabase.client.ts - FIXED VERSION
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export const supabaseClient = (config: ConfigService) => {
  const url = config.get<string>('SUPABASE_URL');
  const anonKey = config.get<string>('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    console.error('❌ Missing Supabase client configuration:', {
      hasURL: !!url,
      hasAnonKey: !!anonKey,
    });
    throw new Error(
      `Missing Supabase configuration: URL=${!!url}, ANON_KEY=${!!anonKey}`
    );
  }

  console.log('✓ Creating Supabase client:', {
    url: url.substring(0, 30) + '...',
    anonKeyLength: anonKey.length,
    anonKeyPrefix: anonKey.substring(0, 20) + '...',
  });

  return createClient(url, anonKey);
};

export const supabaseAdmin = (config: ConfigService) => {
  const url = config.get<string>('SUPABASE_URL');
  const serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = config.get<string>('SUPABASE_ANON_KEY');

  // Debug logging
  console.log('Creating Supabase ADMIN client:', {
    url: url?.substring(0, 30) + '...',
    hasServiceKey: !!serviceKey,
    serviceKeyLength: serviceKey?.length || 0,
    serviceKeyPrefix: serviceKey?.substring(0, 20) + '...',
    looksLikeJWT: serviceKey?.startsWith('eyJ'),
    // CRITICAL CHECK: Make sure service key is different from anon key
    isDifferentFromAnonKey: serviceKey !== anonKey,
  });

  if (!url) {
    console.error('❌ SUPABASE_URL is not configured');
    throw new Error('SUPABASE_URL is not configured');
  }

  if (!serviceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not configured');
    console.error('Check your .env file for SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  if (!serviceKey.startsWith('eyJ')) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT');
    console.error('Current value starts with:', serviceKey.substring(0, 10));
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT token. ' +
      'Make sure you copied the service_role key from Supabase Dashboard → Project Settings → API'
    );
  }

  // CRITICAL: Check if service key is same as anon key (common mistake)
  if (serviceKey === anonKey) {
    console.error('❌ CRITICAL ERROR: SUPABASE_SERVICE_ROLE_KEY is the same as SUPABASE_ANON_KEY!');
    console.error('You must use the SERVICE_ROLE key (the secret one), not the ANON key');
    console.error('Go to Supabase Dashboard → Settings → API and copy the "service_role" key');
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY cannot be the same as SUPABASE_ANON_KEY. ' +
      'Please use the actual service_role key from your Supabase dashboard.'
    );
  }

  console.log('✓ Admin client configuration looks valid');

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};