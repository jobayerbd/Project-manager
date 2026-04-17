import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Use dummy values if missing to prevent initialization crash, 
// but we'll check validity before making calls.
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://mgrurfiudqidsyzqdywd.supabase.co',
  supabaseAnonKey || 'sb_publishable_DYVtFD5AVn7JGIwExl-w7Q_Gz6JtMbL'
);

export { isConfigured };
