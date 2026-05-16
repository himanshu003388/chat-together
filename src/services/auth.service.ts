import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { AppError, ConflictError, UnauthorizedError } from '../utils/errors';

export class AuthService {
  constructor(private supabase: SupabaseClient) {}

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.warn({ email, error: error.message }, 'Sign-in attempt failed');
      throw new UnauthorizedError(error.message);
    }

    if (data.user) {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        await this.supabase.auth.signOut();
        logger.info({ userId: data.user.id }, 'Banned user attempted sign-in');
        throw new UnauthorizedError('Your account is banned');
      }
    }

    return data;
  }

  async signUp(email: string, password: string, username: string) {
    // Check if username exists
    const { data: existingUser } = await this.supabase
      .from('profiles')
      .select('username')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      throw new ConflictError('Username is already taken');
    }

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) {
      logger.error({ email, error: error.message }, 'Sign-up failed');
      throw new AppError(error.message, 400);
    }

    // If auto-logged in (no email confirmation required)
    if (data.user && data.session) {
      const ADMIN_EMAIL = 'himanshu003388@gmail.com';
      const role = email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';

      await this.supabase.from('profiles').upsert({
        id: data.user.id,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        role: role,
      });
    }

    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      logger.error({ error: error.message }, 'Sign-out failed');
      throw new AppError(error.message, 500);
    }
  }

  async resendConfirmation(email: string) {
    const { error } = await this.supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      logger.warn({ email, error: error.message }, 'Resend confirmation failed');
      throw new AppError(error.message, 400);
    }
  }
}
