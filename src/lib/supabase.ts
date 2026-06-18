import { createServerClient } from '@supabase/ssr';

export const supabaseClient = (context: any) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.');
    throw new Error('Supabase environment variables are not defined');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          const all: Array<{ name: string; value: string }> = [];
          const cookieHeader = context.request.headers.get('Cookie') ?? '';
          if (!cookieHeader) return all;
          for (const cookie of cookieHeader.split(';')) {
            const eqIdx = cookie.indexOf('=');
            if (eqIdx === -1) continue;
            const name = cookie.slice(0, eqIdx).trim();
            const value = cookie.slice(eqIdx + 1).trim();
            if (name) all.push({ name, value });
          }
          return all;
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          for (const { name, value, options } of cookiesToSet) {
            context.cookies.set(name, value, {
              path: '/',
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              ...options,
            });
          }
        },
      },
    }
  );
};