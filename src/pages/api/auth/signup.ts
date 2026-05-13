import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const formData = await request.formData();
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();
  const username = formData.get('username')?.toString();

  if (!email || !password || !username) {
    return redirect('/signup?error=Email, password, and username are required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return redirect('/signup?error=Please enter a valid email address');
  }

  if (password.length < 8) {
    return redirect('/signup?error=Password must be at least 8 characters');
  }

  if (username.length < 3 || username.length > 30) {
    return redirect('/signup?error=Username must be between 3 and 30 characters');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return redirect('/signup?error=Username can only contain letters, numbers, and underscores');
  }

  const supabase = locals.supabase;

  const { data: existingUser } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    return redirect('/signup?error=Username is already taken');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      },
    },
  });

  if (error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
      return redirect('/signup?error=An account with this email already exists');
    }
    return redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user && !data.session) {
    return redirect(`/login?message=Please check your email to confirm your account&email=${encodeURIComponent(email)}`);
  }

  if (data.user && data.session) {
    const ADMIN_EMAIL = 'himanshu003388@gmail.com'; // Change this to your actual admin email
    const role = email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      role: role,
    }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return redirect(`/signup?error=Failed to create user profile`);
    }
  }

  return redirect('/chat');
};