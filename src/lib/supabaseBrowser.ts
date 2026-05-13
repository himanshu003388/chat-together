import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables are missing');
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )
}
