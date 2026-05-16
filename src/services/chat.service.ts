import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { AppError, NotFoundError, ForbiddenError } from '../utils/errors';

export class ChatService {
  constructor(private supabase: SupabaseClient) {}

  async getRooms() {
    const { data, error } = await this.supabase
      .from('chat_rooms')
      .select(`
        *,
        chat_room_members(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch rooms');
      throw new AppError('Failed to fetch chat rooms');
    }

    return data;
  }

  async getRoomById(roomId: string, userId: string) {
    // 1. Fetch room details
    const { data: room, error: roomError } = await this.supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      logger.warn({ roomId }, 'Room not found');
      throw new NotFoundError('Chat room not found');
    }

    // 2. Check membership
    const { data: membership, error: memberError } = await this.supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      if (!room.is_private) {
        // Auto-join public room
        const { error: joinError } = await this.supabase
          .from('chat_room_members')
          .insert({ room_id: roomId, user_id: userId });
        
        if (joinError) {
          logger.error({ roomId, userId, error: joinError.message }, 'Failed to join room');
          throw new AppError('Failed to join chat room');
        }
        logger.info({ roomId, userId }, 'User joined public room');
      } else {
        throw new ForbiddenError('This is a private room');
      }
    }

    return room;
  }

  async createRoom(name: string, isPrivate: boolean, createdBy: string) {
    const { data, error } = await this.supabase
      .from('chat_rooms')
      .insert({
        name,
        is_private: isPrivate,
        created_by: createdBy
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create room');
      throw new AppError('Failed to create chat room');
    }

    // Creator automatically becomes a member
    await this.supabase
      .from('chat_room_members')
      .insert({ room_id: data.id, user_id: createdBy });

    return data;
  }

  async getRoomMessages(roomId: string) {
    const { data, error } = await this.supabase
      .from('messages')
      .select(`
        *,
        profiles:sender_id(id, username, avatar_url),
        reactions(*)
      `)
      .eq('chat_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ roomId, error: error.message }, 'Failed to fetch room messages');
      throw new AppError('Failed to load messages');
    }

    return data;
  }

  async sendMessage(
    senderId: string, 
    content: string | null, 
    chatId: string | null = null, 
    receiverId: string | null = null, 
    replyTo: string | null = null,
    fileData: { url: string; name: string; type: string } | null = null
  ) {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        chat_id: chatId,
        content,
        reply_to: replyTo,
        file_url: fileData?.url || null,
        file_name: fileData?.name || null,
        file_type: fileData?.type || null
      })
      .select(`
        *,
        profiles:sender_id(id, username, avatar_url)
      `)
      .single();

    if (error) {
      logger.error({ senderId, error: error.message }, 'Failed to send message');
      throw new AppError(error.message);
    }

    return data;
  }

  async deleteMessage(messageId: string, userId: string) {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .match({ id: messageId, sender_id: userId });

    if (error) {
      logger.error({ messageId, error: error.message }, 'Failed to delete message');
      throw new AppError('Failed to delete message');
    }
  }

  async updateMessage(messageId: string, userId: string, content: string) {
    const { error } = await this.supabase
      .from('messages')
      .update({ content })
      .match({ id: messageId, sender_id: userId });

    if (error) {
      logger.error({ messageId, error: error.message }, 'Failed to update message');
      throw new AppError('Failed to update message');
    }
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const { error } = await this.supabase
      .from('reactions')
      .insert({ message_id: messageId, user_id: userId, emoji });

    if (error) {
      if (error.code === '23505') return; // Ignore duplicates
      logger.error({ messageId, userId, error: error.message }, 'Failed to add reaction');
      throw new AppError('Failed to add reaction');
    }
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const { error } = await this.supabase
      .from('reactions')
      .delete()
      .match({ message_id: messageId, user_id: userId, emoji });

    if (error) {
      logger.error({ messageId, userId, error: error.message }, 'Failed to remove reaction');
      throw new AppError('Failed to remove reaction');
    }
  }

  async uploadAttachment(roomId: string, senderId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${roomId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await this.supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (uploadError) {
      logger.error({ roomId, error: uploadError.message }, 'File upload failed');
      throw new AppError('File upload failed');
    }

    // Insert message with file info
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        chat_id: roomId,
        file_url: fileName,
        file_name: file.name,
        file_type: file.type,
        content: `Sent a file: ${file.name}`
      })
      .select(`
        *,
        profiles:sender_id(id, username, avatar_url)
      `)
      .single();

    if (error) {
      throw new AppError('Failed to record file message');
    }

    return data;
  }

  async pinMessage(messageId: string, pinnedBy: string) {
    const { error } = await this.supabase
      .from('pinned_messages')
      .insert({ message_id: messageId, pinned_by: pinnedBy });

    if (error) {
      logger.error({ messageId, error: error.message }, 'Failed to pin message');
      throw new AppError('Failed to pin message');
    }
  }

  async unpinMessage(messageId: string) {
    const { error } = await this.supabase
      .from('pinned_messages')
      .delete()
      .eq('message_id', messageId);

    if (error) {
      logger.error({ messageId, error: error.message }, 'Failed to unpin message');
      throw new AppError('Failed to unpin message');
    }
  }

  async getPinnedMessages(chatId: string) {
    const { data, error } = await this.supabase
      .from('pinned_messages')
      .select(`
        *,
        messages!inner(
          *,
          profiles:sender_id(id, username, avatar_url)
        )
      `)
      .eq('messages.chat_id', chatId);

    if (error) {
      logger.error({ chatId, error: error.message }, 'Failed to fetch pins');
      throw new AppError('Failed to load pinned messages');
    }

    return data;
  }
}
