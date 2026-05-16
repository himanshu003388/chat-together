import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return redirect("/login?error=Email and password are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return redirect("/login?error=Please enter a valid email address");
  }

  const { data, error } = await locals.supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('invalid login') || errorMessage.includes('invalid credentials') || errorMessage.includes('invalid')) {
      return redirect("/login?error=Invalid email or password");
    }
    if (errorMessage.includes('email not confirmed')) {
      return redirect(`/login?error=Please confirm your email address first&email=${encodeURIComponent(email)}`);
    }
    if (errorMessage.includes('too many requests')) {
      return redirect("/login?error=Too many attempts. Please try again later.");
    }
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    const { data: profile } = await locals.supabase
      .from('profiles')
      .select('id, is_banned')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      const username = data.user.user_metadata?.username || data.user.email?.split('@')[0];
      const { error: profileError } = await locals.supabase.from('profiles').insert({
        id: data.user.id,
        username: username?.toLowerCase() || email.split('@')[0].toLowerCase(),
        email: email.toLowerCase(),
        role: 'user',
      });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return redirect("/login?error=Failed to load user profile");
      }

      const { data: newProfile } = await locals.supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', data.user.id)
        .maybeSingle();

      if (newProfile?.is_banned) {
        await locals.supabase.auth.signOut();
        return redirect("/login?error=Your account has been banned");
      }
    } else if (profile.is_banned) {
      await locals.supabase.auth.signOut();
      return redirect("/login?error=Your account has been banned");
    }
  }

  return redirect("/");
};