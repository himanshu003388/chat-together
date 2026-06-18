import { defineMiddleware } from "astro:middleware";
import { supabaseClient } from "./lib/supabase";
import { logger } from "./utils/logger";

const protectedRoutes = ["/profile", "/chat", "/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, locals } = context;
  const start = Date.now();

  // Skip middleware for static assets — huge cold-start win on Vercel
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|json)$/i.test(url.pathname)) {
    return next();
  }

  // 1. Logger Middleware (Simplified for Astro)
  logger.info({
    method: request.method,
    url: url.pathname,
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  // 2. Supabase Client Initialization
  let supabase;
  try {
    supabase = supabaseClient(context);
    locals.supabase = supabase;
  } catch (err) {
    logger.error({ err }, 'Supabase initialization failed');
    return new Response('Service unavailable', { status: 503 });
  }

  // 3. Authentication
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err) {
    logger.warn({ err }, 'getUser failed (non-fatal)');
  }
  locals.user = user;

  const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    return context.redirect("/login");
  }

  // 4. User Profile & Authorization
  if (user) {
    try {
      const ADMIN_EMAIL = import.meta.env.ADMIN_EMAIL || '';

      // First try to get existing profile
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      // If profile doesn't exist, create one
      if (profileError && profileError.code === 'PGRST116') {
        const username = user.user_metadata?.username || user.email?.split('@')[0] || 'User';
        const isAdminEmail = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const role = isAdminEmail ? 'admin' : 'user';

        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            username,
            email: user.email,
            role,
          })
          .select()
          .single();

        if (!insertError && newProfile) {
          profile = newProfile;
        }
      } else if (profileError) {
        logger.error({ profileError }, 'Profile fetch error');
      } else {
        // Ensure admin email always has admin role
        const isAdminEmail = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        if (profile && isAdminEmail && profile.role !== 'admin') {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', user.id);

          if (!updateError) {
            profile = { ...profile, role: 'admin' };
          }
        }
      }

      locals.profile = profile;

      // Banned user check
      if (profile?.is_banned && isProtectedRoute) {
        if (!url.pathname.includes('/api/auth/signout')) {
          return context.redirect("/?error=Your account is banned");
        }
      }

      // Admin route protection - check db role instead of hardcoded email
      if (url.pathname.startsWith("/admin") && profile?.role !== 'admin') {
        return context.redirect("/");
      }
    } catch (err) {
      logger.error({ err }, 'Profile processing error');
    }
  }

  const response = await next();
  
  // Cache publicly-renderable pages at CDN edge for 60s
  if (response.status === 200 && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/chat')) {
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  }
  
  // Log duration
  const duration = Date.now() - start;
  logger.info({
    method: request.method,
    url: url.pathname,
    status: response.status,
    duration: `${duration}ms`,
  });

  return response;
});
