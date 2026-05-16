import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, MoreVertical, Hash, ChevronLeft, Smile, Reply as ReplyIcon,
  X, CornerDownRight, Pin, File as FileIcon, Download, Cpu, Zap, Shield
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [realtimeStatus, setRealtimeStatus] = useState<string>('connecting');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatService = useMemo(() => new ChatService(supabase), []);

  useEffect(() => {
    fetchMessages();
    fetchPins();

    const messageChannel = supabase
      .channel(`room-messages-${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${roomId}`
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
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

          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          fetchMessages();
        }
      })
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    const extraChannel = supabase
      .channel(`room-extras-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchPins())
      .subscribe();

    const presenceChannel = supabase.channel(`room-presence-${roomId}`);
    
    presenceChannel
      .on('presence', { event: 'sync' }, () => {})
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUser.id) {
          setOtherUserTyping(payload.typing ? payload.username : null);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: currentUser.id,
            username: currentUser.username,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(extraChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [roomId, currentUser.id]);

  // Polling fallback for reliability
  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, otherUserTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

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

    const tempId = 'temp-' + Date.now().toString() + Math.random().toString(36).substring(7);
    const newMsg: Message = {
      id: tempId,
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
      fetchMessages();
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

  const getFileUrl = (path: string) => `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;

  return (
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden relative">
      {/* Header */}
      <div className="p-4 sm:p-6 glass-dark border-b border-white/5 relative z-10 bg-black/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <a href="/chat/rooms" className="p-2.5 rounded-xl hover:bg-white/5 transition-all md:hidden text-white/60">
              <ChevronLeft className="w-5 h-5" />
            </a>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-purple via-accent-pink to-accent-cyan p-[1px] shadow-lg shadow-accent-purple/20">
              <div className="w-full h-full rounded-2xl bg-surface-primary flex items-center justify-center">
                <Hash className="w-6 h-6 text-accent-purple" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tighter uppercase italic flex items-center gap-2">
                {roomName}
                <Zap className="w-3.5 h-3.5 text-accent-purple opacity-50" />
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={cn("w-2 h-2 rounded-full", realtimeStatus === 'SUBSCRIBED' ? "bg-accent-emerald animate-pulse" : "bg-accent-pink")}></div>
                <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">
                  Real-time Data Stream 
                  <span className={cn("ml-2 opacity-100", realtimeStatus === 'SUBSCRIBED' ? "text-accent-emerald" : "text-accent-pink")}>
                    [{realtimeStatus.toUpperCase()}]
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setShowPins(!showPins)}
              className={cn("p-3 rounded-2xl transition-all relative", showPins ? "bg-accent-purple text-white shadow-glow-purple" : "text-white/40 hover:text-white hover:bg-white/5")}
              title="Pinned Data"
             >
              <Pin className="w-5 h-5" />
              {pinnedMessages.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-accent-pink rounded-full border-2 border-surface-secondary"></span>}
            </button>
            <button className="p-3 rounded-2xl hover:bg-white/5 transition-all text-white/40 hover:text-white">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Pins Side Panel */}
      <AnimatePresence>
        {showPins && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPins(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute right-0 top-0 bottom-0 w-full sm:w-96 glass-dark border-l border-white/5 z-50 shadow-2xl flex flex-col bg-black/60 backdrop-blur-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Pin className="w-5 h-5 text-accent-purple" />
                  <h3 className="font-bold text-lg tracking-tighter uppercase italic">Pinned Stream</h3>
                </div>
                <button onClick={() => setShowPins(false)} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {pinnedMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                    <Pin className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-xs uppercase font-mono tracking-[0.3em]">No data artifacts pinned</p>
                  </div>
                ) : (
                  pinnedMessages.map(pin => (
                    <div key={pin.id} className="glass-card p-5 relative group/pin hover:border-accent-purple/30 transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-white/10 flex items-center justify-center text-[10px] font-bold text-accent-purple">
                           {pin.messages.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="font-bold text-sm text-accent-purple uppercase italic tracking-wide">@{pin.messages.profiles?.username}</span>
                      </div>
                      <p className="text-white/70 text-sm leading-relaxed line-clamp-4 italic">"{pin.messages.content}"</p>
                      <button onClick={() => togglePin(pin.message_id)} className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover/pin:opacity-100 transition-all hover:bg-red-500 hover:text-white">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar relative z-10 bg-black/5">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin" />
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-purple animate-pulse">Initializing Room Feed...</div>
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
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 200, delay: Math.min(idx * 0.05, 0.5) }}
                  className={cn("flex", isMe ? 'justify-end' : 'justify-start', "group/msg")}
                  onClick={() => setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id)}
                >
                  <div className={cn("flex flex-col", isMe ? 'items-end' : 'items-start', "max-w-[90%] sm:max-w-[70%]")}>
                    
                    {msg.reply_message && (
                      <div className="flex items-center gap-2 mb-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer px-1">
                        <CornerDownRight className="w-3.5 h-3.5 text-accent-cyan" />
                        <div className="text-[10px] font-mono text-white/40 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                          <span className="text-accent-cyan mr-2">RE: @{msg.reply_message.profiles?.username}</span>
                          <span className="truncate max-w-[150px] inline-block align-bottom">{msg.reply_message.content}</span>
                        </div>
                      </div>
                    )}

                    {!isMe && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-6 h-6 rounded-lg bg-surface-elevated border border-white/10 flex items-center justify-center text-[10px] font-bold text-accent-purple">
                          {msg.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-white/50 tracking-wide uppercase italic">{msg.profiles?.username}</span>
                      </div>
                    )}

                    <div className="relative group/bubble">
                      <div className={cn(
                        "rounded-2xl px-5 py-4 transition-all duration-300 relative",
                        isMe 
                          ? "bg-gradient-to-br from-accent-purple to-accent-pink text-white rounded-tr-none shadow-[0_10px_30px_rgba(168,85,247,0.15)]" 
                          : "glass-dark border border-white/5 text-white/90 rounded-tl-none hover:border-white/10",
                        selectedMessageId === msg.id ? 'ring-2 ring-accent-purple/50 scale-[1.02]' : ''
                      )}>
                        {isPinned && (
                          <div className="absolute -top-3 -right-3 w-7 h-7 bg-surface-primary border border-accent-cyan/30 rounded-full flex items-center justify-center shadow-lg">
                            <Pin className="w-3.5 h-3.5 text-accent-cyan fill-accent-cyan" />
                          </div>
                        )}
                        
                        {msg.file_url && (
                          <div className="mb-4 overflow-hidden rounded-xl bg-black/20 border border-white/5">
                            {msg.file_type?.startsWith('image/') ? (
                              <img src={getFileUrl(msg.file_url)} alt={msg.file_name} className="max-w-full h-auto max-h-[300px] object-contain cursor-pointer transition-transform hover:scale-105" />
                            ) : (
                              <div className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-accent-purple">
                                  <FileIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                  <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono">{msg.file_type?.split('/')[1] || 'FILE'}</p>
                                </div>
                                <a href={getFileUrl(msg.file_url)} download className="p-2.5 hover:bg-white/10 rounded-xl text-accent-purple"><Download className="w-5 h-5" /></a>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <p className="text-[15px] leading-relaxed tracking-tight whitespace-pre-wrap">{msg.content}</p>
                      </div>

                      {/* Action Tools */}
                      <div className={cn(
                        "absolute -top-14 transition-all duration-300 flex items-center gap-1.5 glass-dark p-1.5 rounded-2xl border border-white/10 shadow-2xl z-20",
                        isMe ? 'right-0' : 'left-0',
                        selectedMessageId === msg.id ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none sm:group-hover/bubble:opacity-100 sm:group-hover/bubble:translate-y-0 sm:group-hover/bubble:pointer-events-auto'
                      )}>
                        <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); setSelectedMessageId(null); }} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-colors" title="Reply"><ReplyIcon className="w-4.5 h-4.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id); }} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-colors" title="React"><Smile className="w-4.5 h-4.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); togglePin(msg.id); setSelectedMessageId(null); }} className={cn("p-2.5 rounded-xl transition-colors", isPinned ? 'text-accent-cyan bg-accent-cyan/10' : 'text-white/40 hover:text-white hover:bg-white/5')} title="Pin"><Pin className="w-4.5 h-4.5" /></button>
                      </div>

                      {showEmojiPicker === msg.id && (
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} className={cn("absolute bottom-full mb-4 z-50 glass-dark border border-white/10 p-2 rounded-2xl flex gap-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-x-auto max-w-[300px]", isMe ? 'right-0' : 'left-0')}>
                          {COMMON_EMOJIS.map(emoji => (
                            <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); setSelectedMessageId(null); }} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-all text-xl shrink-0 hover:scale-125">{emoji}</button>
                          ))}
                        </motion.div>
                      )}
                    </div>

                    {reactions.length > 0 && (
                      <div className={cn("flex flex-wrap gap-1.5 mt-3", isMe ? 'justify-end' : 'justify-start')}>
                        {reactions.map(r => (
                          <button key={r.emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, r.emoji); }} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all", r.users.includes(currentUser.id) ? 'bg-accent-purple/10 border-accent-purple/50 text-accent-purple shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/20')}>
                            <span>{r.emoji}</span>
                            <span className="opacity-80">{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={cn("mt-2 flex items-center gap-2 px-1", isMe ? 'flex-row-reverse' : '')}>
                      <span className="text-[9px] text-white/10 font-mono tracking-tighter uppercase">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Typing & Input Area */}
      <div className="p-4 sm:p-6 glass-dark border-t border-white/5 bg-black/40 z-10 relative">
        <div className="h-8 mb-2">
          <AnimatePresence>
            {otherUserTyping && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="flex items-center gap-3 text-[10px] text-accent-cyan font-bold uppercase tracking-[0.2em] animate-pulse px-2">
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-accent-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {otherUserTyping} is encoding...
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {replyingTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-4 overflow-hidden">
              <div className="p-4 glass-card bg-accent-purple/5 border-accent-purple/20 flex items-start justify-between rounded-2xl border-l-4 border-l-accent-purple">
                <div className="flex gap-4 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center shrink-0">
                    <ReplyIcon className="w-5 h-5 text-accent-purple" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <p className="text-[10px] font-mono font-bold text-accent-purple uppercase tracking-widest mb-1">REPLYING TO @{replyingTo.profiles?.username}</p>
                    <p className="text-sm text-white/60 truncate italic italic leading-relaxed">"{replyingTo.content}"</p>
                  </div>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-pink transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-3 items-end max-w-6xl mx-auto">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-4 rounded-2xl hover:bg-white/5 text-white/40 hover:text-accent-purple transition-all mb-0.5 disabled:opacity-20"
          >
            {uploading ? <div className="w-6 h-6 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin" /> : <Paperclip className="w-6 h-6" />}
          </button>
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-accent-purple/5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl pointer-events-none" />
            <input 
              type="text" 
              value={newMessage} 
              onChange={handleTyping} 
              placeholder={uploading ? "Uploading data burst..." : `Message #${roomName}...`} 
              className="input-glass !bg-black/60 !py-4 !px-6 text-base !border-white/10 focus:!border-accent-purple/50 focus:!ring-accent-purple/10 transition-all placeholder:text-white/20" 
              disabled={uploading} 
            />
          </div>
          <button 
            type="submit" 
            disabled={!newMessage.trim() || uploading} 
            className={cn(
              "p-4 rounded-2xl font-bold flex items-center justify-center transition-all mb-0.5 shadow-2xl group",
              !newMessage.trim() || uploading
                ? "bg-white/5 text-white/20"
                : "bg-gradient-to-r from-accent-purple to-accent-pink text-white shadow-accent-purple/20 hover:shadow-accent-purple/40 hover:scale-105 active:scale-95"
            )}
          >
            <Send className="w-6 h-6 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}
