import { d as defineMiddleware, ae as sequence } from './chunks/params-and-props_Bdc0UXF-.mjs';
import 'piccolore';
import 'clsx';
import { createServerClient } from '@supabase/ssr';

const supabaseClient = (context) => {
  const supabaseUrl = "https://yobdetdziljwrlnqanxm.supabase.co";
  const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvYmRldGR6aWxqd3JsbnFhbnhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDc3ODQsImV4cCI6MjA5NDE4Mzc4NH0.vVZl2vhkgXdh9RXJ6ayExyBSsBYz-yHuAprZP8oWe5o";
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          const cookieHeader = context.request.headers.get("Cookie") ?? "";
          return parseCookieHeader(cookieHeader);
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value, options }) => context.cookies.set(name, value, options)
          );
        }
      }
    }
  );
};
function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((cookie) => {
    const [name, ...rest] = cookie.split("=");
    return { name: name?.trim() ?? "", value: rest.join("=").trim() };
  });
}

const protectedRoutes = ["/profile", "/chat", "/admin"];
const onRequest$1 = defineMiddleware(async (context, next) => {
  let supabase;
  try {
    supabase = supabaseClient(context);
  } catch (err) {
    console.error("Supabase initialization failed:", err);
    return new Response("Service unavailable - configuration error", { status: 500 });
  }
  context.locals.supabase = supabase;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  context.locals.user = user;
  const url = new URL(context.request.url);
  if (user) {
    let profile = null;
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = data;
      if (!profile && user.email) {
        const username = user.user_metadata?.username || user.email.split("@")[0];
        const { data: newProfile, error } = await supabase.from("profiles").insert({
          id: user.id,
          username,
          email: user.email,
          role: "user"
        }).select().single();
        if (!error) {
          profile = newProfile;
        }
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
    context.locals.profile = profile;
    if (profile?.is_banned && protectedRoutes.some((route) => url.pathname.startsWith(route))) {
      if (url.pathname !== "/api/auth/signout") {
        if (url.pathname.startsWith("/chat") || url.pathname.startsWith("/admin")) {
          return context.redirect("/?error=Your account is banned");
        }
      }
    }
    if (url.pathname.startsWith("/admin") && profile?.role !== "admin") {
      return context.redirect("/");
    }
  }
  const isProtected = protectedRoutes.some(
    (route) => url.pathname.startsWith(route)
  );
  if (isProtected && !user) {
    return context.redirect("/login");
  }
  return next();
});

const onRequest = sequence(
	
	onRequest$1
	
);

export { onRequest };
