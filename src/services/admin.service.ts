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

  async deleteUser(userId: string) {
    const { error } = await this.supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to delete user');
      throw new AppError('Failed to delete user');
    }

    logger.info({ userId }, 'User deleted');
  }

  async getAllMessages(limit = 100) {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*, profiles:sender_id(id, username, avatar_url), chat_rooms:chat_id(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch messages');
      throw new AppError('Failed to fetch messages');
    }

    return data;
  }

  async getAllChatRooms() {
    const { data, error } = await this.supabase
      .from('chat_rooms')
      .select('*, chat_room_members(count)')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch chat rooms');
      throw new AppError('Failed to fetch chat rooms');
    }

    return data;
  }

  async deleteMessage(messageId: string) {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      logger.error({ messageId, error: error.message }, 'Failed to delete message');
      throw new AppError('Failed to delete message');
    }

    logger.info({ messageId }, 'Message deleted');
  }

  async getAllReactions() {
    const { data, error } = await this.supabase
      .from('reactions')
      .select('*, messages(content), profiles:user_id(id, username)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch reactions');
      throw new AppError('Failed to fetch reactions');
    }

    return data;
  }

  async promoteToAdmin(userId: string) {
    const { error } = await this.supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to promote user');
      throw new AppError('Failed to promote user');
    }

    logger.info({ userId }, 'User promoted to admin');
  }

  async demoteToUser(userId: string) {
    const { error } = await this.supabase
      .from('profiles')
      .update({ role: 'user' })
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to demote user');
      throw new AppError('Failed to demote user');
    }

    logger.info({ userId }, 'User demoted to user');
  }
}
