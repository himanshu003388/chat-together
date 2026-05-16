import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class AdminService {
  constructor(private supabase: SupabaseClient) {}

  async getStats() {
    try {
      const [{ count: userCount }, { count: messageCount }] = await Promise.all([
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }),
        this.supabase.from('messages').select('*', { count: 'exact', head: true })
      ]);

      return { userCount: userCount || 0, messageCount: messageCount || 0 };
    } catch (err) {
      logger.error(err, 'Failed to fetch admin stats');
      throw new AppError('Failed to fetch stats');
    }
  }

  async getRecentUsers(limit = 5) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch recent users');
      throw new AppError('Failed to fetch users');
    }

    return data;
  }

  async getAllUsers() {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch all users');
      throw new AppError('Failed to fetch users');
    }

    return data;
  }

  async toggleBan(userId: string, isBanned: boolean) {
    const { error } = await this.supabase
      .from('profiles')
      .update({ is_banned: isBanned })
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to toggle ban');
      throw new AppError('Failed to update user status');
    }
    
    logger.info({ userId, isBanned }, 'User ban status updated');
  }
}
