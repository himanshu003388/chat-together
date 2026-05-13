import { createServerClient } from '@supabase/ssr';

interface CookieOptions {
  path?: string;
  expires?: Date;
  domain?: string;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  httpOnly?: boolean;
}

export const supabaseClient = (context: { request: { headers: { get: (key: string) => string | null } }; cookies: { set: (name: string, value: string, options?: CookieOptions) => void } }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.');
    // Return a dummy client or throw a more descriptive error
    // Throwing here will be caught by Astro's 500 handler
    throw new Error('Supabase environment variables are not defined');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          const cookieHeader = context.request.headers.get('Cookie') ?? '';
          return parseCookieHeader(cookieHeader);
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            context.cookies.set(name, value, options)
          );
        },
      },
    }
  );
};

function parseCookieHeader(cookieHeader: string): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];
  return cookieHeader.split(';').map(cookie => {
    const [name, ...rest] = cookie.split('=');
    return { name: name?.trim() ?? '', value: rest.join('=').trim() };
  });
}