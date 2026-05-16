import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class ProfileService {
  constructor(private supabase: SupabaseClient) {}

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to fetch profile');
      throw new AppError('Failed to fetch profile');
    }

    return data;
  }

  async updateProfile(userId: string, updates: { username?: string; bio?: string; avatar_url?: string }) {
    const { error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to update profile');
      throw new AppError('Failed to update profile');
    }
  }

  async uploadAvatar(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(fileName, file);

    if (uploadError) {
      logger.error({ userId, error: uploadError.message }, 'Avatar upload failed');
      throw new AppError('Avatar upload failed');
    }

    return fileName;
  }
}
