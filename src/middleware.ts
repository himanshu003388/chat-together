import { defineMiddleware } from "astro:middleware";
import { supabaseClient } from "./lib/supabase";

const protectedRoutes = ["/profile", "/chat", "/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  let supabase;
  try {
    supabase = supabaseClient(context);
  } catch (err) {
    console.error('Supabase initialization failed:', err);
    return new Response('Service unavailable - configuration error', { status: 500 });
  }

  // Set supabase client to locals
  context.locals.supabase = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Set user to locals
  context.locals.user = user;

  const url = new URL(context.request.url);

  // If user is logged in, fetch their profile
  if (user) {
    let profile = null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;

      // Create profile if it doesn't exist
      if (!profile && user.email) {
        const username = user.user_metadata?.username || user.email.split('@')[0];
        const { data: newProfile, error } = await supabase.from('profiles').insert({
          id: user.id,
          username,
          email: user.email,
          role: 'user',
        }).select().single();

        if (!error) {
          profile = newProfile;
        }
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    }

    // Set profile to locals
    context.locals.profile = profile;

    // Check if user is banned
    if (profile?.is_banned && protectedRoutes.some(route => url.pathname.startsWith(route))) {
      // Allow signout even if banned
      if (url.pathname !== '/api/auth/signout') {
        // We can either redirect to a banned page or just let the Layout handle it
        // For now, let's just let it pass and let Layout show the banner, 
        // but maybe restrict /chat and /admin
        if (url.pathname.startsWith('/chat') || url.pathname.startsWith('/admin')) {
          return context.redirect("/?error=Your account is banned");
        }
      }
    }

    // Admin route protection
    if (url.pathname.startsWith("/admin") && profile?.role !== 'admin') {
      return context.redirect("/");
    }
  }

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) =>
    url.pathname.startsWith(route)
  );

  if (isProtected && !user) {
    return context.redirect("/login");
  }

  return next();
});
