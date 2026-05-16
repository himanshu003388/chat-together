import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  MoreVertical,
  Hash,
  ChevronLeft,
  Smile,
  Reply as ReplyIcon,
  X,
  CornerDownRight,
  Pin,
  File as FileIcon,
  Download
} from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string | null;
  created_at: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  reply_to?: string;
  profiles?: Profile;
  reactions?: Reaction[];
  reply_message?: {
    content: string;
    profiles?: { username: string };
  };
}

interface RoomChatProps {
  roomId: string;
  roomName: string;
  currentUser: {
    id: string;
    username?: string;
  };
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '✅'];

export default function RoomChat({ roomId, roomName, currentUser }: RoomChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatService = useMemo(() => new ChatService(supabase), []);

  useEffect(() => {
    fetchMessages();
    fetchPins();

    // 1. Message Subscription
    const messageChannel = supabase
      .channel(`room-messages-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${roomId}`
      }, async (payload) => {
        const newMsg = payload.new as Message;
        const { data: profile } = await supabase
          .from('profiles').select('id, username, avatar_url')
          .eq('id', newMsg.sender_id).single();
        
        newMsg.profiles = profile || undefined;
        newMsg.reactions = [];

        if (newMsg.reply_to) {
          const { data: parent } = await supabase
            .from('messages')
            .select('content, profiles:sender_id(username)')
            .eq('id', newMsg.reply_to)
            .single();
          newMsg.reply_message = parent as any;
        }

        setMessages(prev => [...prev, newMsg]);
      })
      .subscribe();

    // 2. Reaction Subscription
    const reactionChannel = supabase
      .channel(`room-reactions-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => {
        fetchMessages();
      })
      .subscribe();

    // 3. Pins Subscription
    const pinChannel = supabase
      .channel(`room-pins-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => {
        fetchPins();
      })
      .subscribe();

    // 4. Typing Indicator (Broadcast)
    const typingChannel = supabase
      .channel(`room-typing-${roomId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUser.id) {
          setOtherUserTyping(payload.typing ? payload.username : null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(pinChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, otherUserTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    // Send typing broadcast
    supabase.channel(`room-typing-${roomId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, username: currentUser.username, typing: true },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      supabase.channel(`room-typing-${roomId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, username: currentUser.username, typing: false },
      });
    }, 2000);
  };

  const fetchMessages = async () => {
    try {
      const data = await chatService.getRoomMessages(roomId);
      if (data) {
        const messagesWithReplies = await Promise.all(data.map(async (msg: any) => {
          if (msg.reply_to) {
            const parent = data.find((m: any) => m.id === msg.reply_to);
            if (parent) {
              msg.reply_message = { content: parent.content, profiles: parent.profiles };
            } else {
              const { data: parentDb } = await supabase
                .from('messages').select('content, profiles:sender_id(username)')
                .eq('id', msg.reply_to).single();
              msg.reply_message = parentDb as any;
            }
          }
          return msg;
        }));
        setMessages(messagesWithReplies);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPins = async () => {
    try {
      const data = await chatService.getPinnedMessages(roomId);
      setPinnedMessages(data || []);
    } catch (err) {
      console.error('Failed to fetch pins:', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const content = newMessage;
    const replyId = replyingTo?.id || null;

    // Optimistic update - add message immediately
    const newMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      content: content,
      sender_id: currentUser.id,
      chat_id: roomId,
      created_at: new Date().toISOString(),
      profiles: { id: currentUser.id, username: currentUser.username || 'You', avatar_url: null },
      reactions: []
    };
    setMessages(prev => [...prev, newMsg]);

    setNewMessage('');
    setReplyingTo(null);

    try {
      await chatService.sendMessage(currentUser.id, content, roomId, null, replyId);
    } catch (err) {
      console.error('Failed to send:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await chatService.uploadAttachment(roomId, currentUser.id, file);
    } catch (err) {
      alert('File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find(m => m.id === messageId);
    const existing = msg?.reactions?.find(r => r.user_id === currentUser.id && r.emoji === emoji);

    try {
      if (existing) {
        await chatService.removeReaction(messageId, currentUser.id, emoji);
      } else {
        await chatService.addReaction(messageId, currentUser.id, emoji);
      }
      setShowEmojiPicker(null);
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  };

  const togglePin = async (messageId: string) => {
    const isPinned = pinnedMessages.some(p => p.message_id === messageId);
    try {
      if (isPinned) {
        await chatService.unpinMessage(messageId);
      } else {
        await chatService.pinMessage(messageId, currentUser.id);
      }
    } catch (err) {
      console.error('Pin toggle failed:', err);
    }
  };

  const groupReactions = (reactions: Reaction[] = []) => {
    const groups: Record<string, { emoji: string; count: number; users: string[] }> = {};
    reactions.forEach(r => {
      if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      groups[r.emoji].count++;
      groups[r.emoji].users.push(r.user_id);
    });
    return Object.values(groups);
  };

  const getFileUrl = (path: string) => {
    return `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;
  };

  return (
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden relative">
      {/* Header */}
      <div className="p-4 border-b border-white/5 glass">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/chat/rooms" className="p-2 rounded-lg hover:bg-white/10 transition-all md:hidden">
              <ChevronLeft className="w-5 h-5" />
            </a>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{roomName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 bg-accent-emerald rounded-full animate-pulse"></span>
                <p className="text-xs text-white/40 font-mono">Real-time Stream</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowPins(!showPins)}
              className={`p-2.5 rounded-lg transition-all ${showPins ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
              title="Pinned Messages"
             >
              <Pin className="w-5 h-5" />
              {pinnedMessages.length > 0 && (
                <span className="absolute top-3 right-12 w-4 h-4 bg-accent-cyan text-surface-primary text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-surface-primary">
                  {pinnedMessages.length}
                </span>
              )}
            </button>
            <button className="p-2.5 rounded-lg hover:bg-white/10 transition-all text-white/60">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Pinned Messages Side Panel */}
      <AnimatePresence>
        {showPins && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute right-0 top-[73px] bottom-0 w-80 bg-surface-secondary border-l border-white/5 z-40 shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h3 className="font-bold text-sm uppercase tracking-widest text-white/60 flex items-center gap-2">
                <Pin className="w-4 h-4 text-accent-cyan" />
                Pinned Messages
              </h3>
              <button onClick={() => setShowPins(false)} className="p-1 hover:bg-white/10 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {pinnedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Pin className="w-12 h-12 text-white/10 mb-4" />
                  <p className="text-white/40 text-xs">No pinned messages yet. Use the message menu to pin important info.</p>
                </div>
              ) : (
                pinnedMessages.map(pin => (
                  <div key={pin.id} className="glass-card p-3 text-xs relative group/pin">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-bold">
                        {pin.messages.profiles?.username?.[0].toUpperCase()}
                      </div>
                      <span className="font-bold text-accent-cyan">@{pin.messages.profiles?.username}</span>
                    </div>
                    <p className="text-white/70 line-clamp-3 mb-2">{pin.messages.content}</p>
                    <button 
                      onClick={() => togglePin(pin.message_id)}
                      className="absolute top-2 right-2 opacity-0 group-hover/pin:opacity-100 transition-opacity p-1 text-red-400 hover:bg-red-400/10 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <span className="text-[8px] text-white/20 font-mono">
                      {new Date(pin.messages.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin"></div>
            <span className="text-sm text-white/40 font-mono uppercase tracking-widest">Initializing...</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === currentUser.id;
              const reactions = groupReactions(msg.reactions);
              const isPinned = pinnedMessages.some(p => p.message_id === msg.id);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} group/msg`}
                >
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                    
                    {/* Reply Preview */}
                    {msg.reply_message && (
                      <div className="flex items-center gap-2 mb-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer ml-2">
                        <CornerDownRight className="w-3 h-3 text-accent-cyan" />
                        <div className="text-[10px] font-medium text-white/60 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                          <span className="text-accent-cyan mr-1">@{msg.reply_message.profiles?.username}</span>
                          {msg.reply_message.content}
                        </div>
                      </div>
                    )}

                    {!isMe && (
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-[10px] font-bold text-white">
                          {msg.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-white/70 tracking-tight">{msg.profiles?.username}</span>
                      </div>
                    )}

                    <div className="relative group/bubble">
                      <div className={`rounded-2xl px-4 py-3 transition-all relative ${
                        isMe 
                          ? 'bg-gradient-to-br from-accent-purple to-accent-pink text-white shadow-lg shadow-accent-purple/10' 
                          : 'bg-surface-elevated border border-white/5'
                      }`}>
                        {isPinned && (
                          <div className="absolute -top-2 -right-2 w-5 h-5 bg-accent-cyan rounded-full flex items-center justify-center border-2 border-surface-primary">
                            <Pin className="w-2.5 h-2.5 text-surface-primary" />
                          </div>
                        )}
                        
                        {/* File Attachment Rendering */}
                        {msg.file_url && (
                          <div className="mb-2 overflow-hidden rounded-xl bg-black/10">
                            {msg.file_type?.startsWith('image/') ? (
                              <img src={getFileUrl(msg.file_url)} alt={msg.file_name} className="max-w-full h-auto max-h-[300px] object-contain" />
                            ) : (
                              <div className="p-3 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                                  <FileIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                  <p className="text-[10px] opacity-50 uppercase">{msg.file_type?.split('/')[1] || 'FILE'}</p>
                                </div>
                                <a href={getFileUrl(msg.file_url)} download target="_blank" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>

                      {/* Action Tools */}
                      <div className={`absolute top-0 ${isMe ? '-left-[110px]' : '-right-[110px]'} opacity-0 group-hover/bubble:opacity-100 transition-all flex items-center gap-1 bg-surface-secondary/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl z-20`}>
                        <button onClick={() => setReplyingTo(msg)} className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                          <ReplyIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                          <Smile className="w-4 h-4" />
                        </button>
                        <button onClick={() => togglePin(msg.id)} className={`p-2 rounded-xl transition-colors ${isPinned ? 'text-accent-cyan bg-accent-cyan/10' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>
                          <Pin className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Emoji Picker */}
                      {showEmojiPicker === msg.id && (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`absolute bottom-full mb-3 ${isMe ? 'right-0' : 'left-0'} z-50 bg-surface-secondary border border-white/10 p-2 rounded-2xl flex gap-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)]`}>
                          {COMMON_EMOJIS.map(emoji => (
                            <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-xl">
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>

                    {/* Reactions */}
                    {reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {reactions.map(r => (
                          <button
                            key={r.emoji}
                            onClick={() => toggleReaction(msg.id, r.emoji)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                              r.users.includes(currentUser.id) ? 'bg-accent-purple/20 border-accent-purple text-accent-purple' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`mt-2 flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[10px] text-white/30 font-mono font-bold tracking-tighter uppercase">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      <div className="h-6 px-4">
        <AnimatePresence>
          {otherUserTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="flex items-center gap-2 text-[10px] text-white/40 font-bold uppercase tracking-widest"
            >
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              {otherUserTyping} is typing
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 bg-surface-primary/50 backdrop-blur-md">
        <AnimatePresence>
          {replyingTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 bg-white/5 rounded-2xl p-3 flex items-start justify-between border-l-4 border-accent-cyan">
              <div className="flex gap-3">
                <ReplyIcon className="w-4 h-4 text-accent-cyan mt-1" />
                <div>
                  <p className="text-[10px] font-bold text-accent-cyan uppercase tracking-widest mb-1">Replying to {replyingTo.profiles?.username}</p>
                  <p className="text-xs text-white/60 line-clamp-1">{replyingTo.content}</p>
                </div>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors"><X className="w-4 h-4 text-white/40" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-3.5 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all disabled:opacity-20"
          >
            {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Paperclip className="w-5 h-5" />}
          </button>
          <div className="flex-1 relative">
            <input
              id="room-message-input"
              type="text"
              value={newMessage}
              onChange={handleTyping}
              placeholder={uploading ? "Uploading file..." : `Message #${roomName}`}
              className="input-glass !py-3.5 !rounded-2xl"
              autoComplete="off"
              disabled={uploading}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || uploading}
            className="p-3.5 rounded-xl bg-gradient-to-r from-accent-purple to-accent-pink text-white font-bold shadow-lg shadow-accent-purple/20 transition-all disabled:opacity-30 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
