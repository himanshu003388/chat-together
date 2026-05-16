import { defineMiddleware } from "astro:middleware";
import { supabaseClient } from "./lib/supabase";
import { logger } from "./utils/logger";

const protectedRoutes = ["/profile", "/chat", "/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, locals } = context;
  const start = Date.now();

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
  const { data: { user } } = await supabase.auth.getUser();
  locals.user = user;

  const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    return context.redirect("/login");
  }

  // 4. User Profile & Authorization
  if (user) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      let currentProfile = profile;

      // Auto-create profile if missing
      if (!currentProfile && user.email) {
        const username = user.user_metadata?.username || user.email.split('@')[0];
        const ADMIN_EMAIL = 'himanshu003388@gmail.com';
        const role = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';

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

        if (!insertError) {
          currentProfile = newProfile;
        }
      }

      locals.profile = currentProfile;

      // Banned user check
      if (currentProfile?.is_banned && isProtectedRoute) {
        if (!url.pathname.includes('/api/auth/signout')) {
          return context.redirect("/?error=Your account is banned");
        }
      }

      // Admin route protection
      if (url.pathname.startsWith("/admin") && currentProfile?.role !== 'admin') {
        return context.redirect("/");
      }
    } catch (err) {
      logger.error({ err }, 'Profile processing error');
    }
  }

  const response = await next();
  
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
