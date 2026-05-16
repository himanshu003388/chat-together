import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, FileText, X, Download,
  MessageCircle, Pin, Trash2, Edit3, Search, Smile, Cpu, Zap, Shield, ChevronLeft
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

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  reply_to: string | null;
  created_at: string;
  profiles?: Profile;
  reactions?: Reaction[];
  reply_message?: Message;
  is_read?: boolean;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  count?: number;
}

interface GeneralChatProps {
  currentUser: { id: string; email: string; username?: string };
}

const EMOJI_OPTIONS = ['❤️', '👍', '👎', '😂', '😡', '🎉', '🔥', '💯'];

export default function GeneralChat({ currentUser }: GeneralChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMessages, setFilteredMessages] = useState<Message[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('connecting');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const chatService = useMemo(() => new ChatService(supabase), []);

  useEffect(() => {
    fetchMessages();
    fetchPinnedMessages();

    const messagesChannel = supabase
      .channel('general-messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: 'receiver_id=is.null'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as Message;
          if (!msg.chat_id) fetchMessages();
        } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          fetchMessages();
        }
      })
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    const extraChannel = supabase
      .channel('general-extras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchPinnedMessages())
      .subscribe();

    const presenceChannel = supabase.channel('general-presence');
    
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUsersCount(Object.keys(state).length);
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
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(extraChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [currentUser.id]);

  // Polling fallback for reliability
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
      fetchPinnedMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, filteredMessages]);

  const fetchMessages = async () => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(id, username, avatar_url), reactions(*)')
        .is('receiver_id', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (data) {
        const messagesWithReplies = await Promise.all(
          (data as any[]).map(async (msg) => {
            if (msg.reply_to) {
              const parent = data.find((m: any) => m.id === msg.reply_to);
              if (parent) {
                msg.reply_message = parent;
              } else {
                const { data: dbParent } = await supabase
                  .from('messages')
                  .select('*, profiles:sender_id(username)')
                  .eq('id', msg.reply_to)
                  .single();
                msg.reply_message = dbParent;
              }
            }
            return msg;
          })
        );
        setMessages(messagesWithReplies);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchPinnedMessages = async () => {
    const { data } = await supabase.from('pinned_messages').select('message_id');
    if (data) setPinnedMessages(data.map(p => p.message_id));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;

    setUploading(true);
    try {
      let fileInfo = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `general/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(fileName, selectedFile);
        
        if (uploadError) throw uploadError;
        fileInfo = { url: fileName, name: selectedFile.name, type: selectedFile.type };
      }

      await chatService.sendMessage(currentUser.id, newMessage.trim() || null, null, null, replyTo?.id || null, fileInfo);

      const tempId = 'temp-' + Date.now().toString() + Math.random().toString(36).substring(7);
      const newMsg: Message = {
        id: tempId,
        sender_id: currentUser.id,
        receiver_id: null,
        content: newMessage.trim() || null,
        file_url: fileInfo?.url || null,
        file_name: fileInfo?.name || null,
        file_type: fileInfo?.type || null,
        reply_to: replyTo?.id || null,
        created_at: new Date().toISOString(),
        profiles: { id: currentUser.id, username: currentUser.username || 'You', avatar_url: null },
        reactions: []
      };
      setMessages(prev => [...prev, newMsg]);
      fetchMessages();

      setNewMessage('');
      setReplyTo(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const togglePin = async (messageId: string) => {
    try {
      if (pinnedMessages.includes(messageId)) {
        await chatService.unpinMessage(messageId);
      } else {
        await chatService.pinMessage(messageId, currentUser.id);
      }
    } catch (err) {
      console.error('Pin error:', err);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      const msg = messages.find(m => m.id === messageId);
      const existing = msg?.reactions?.find(r => r.user_id === currentUser.id && r.emoji === emoji);
      
      if (existing) {
        await chatService.removeReaction(messageId, currentUser.id, emoji);
      } else {
        await chatService.addReaction(messageId, currentUser.id, emoji);
      }
      setShowEmojiPicker(null);
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await chatService.deleteMessage(messageId, currentUser.id);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      await chatService.updateMessage(editingId, currentUser.id, editContent.trim());
      setEditingId(null);
      setEditContent('');
    } catch (err) {
      console.error('Update error:', err);
    }
  };

  const searchMessages = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setFilteredMessages(null);
      return;
    }
    const filtered = messages.filter(m => 
      m.content?.toLowerCase().includes(query.toLowerCase()) ||
      m.profiles?.username?.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredMessages(filtered);
  };

  const getFileUrl = (path: string) => `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;

  const displayMessages = filteredMessages || messages;
  const pinnedList = messages.filter(m => pinnedMessages.includes(m.id));

  return (
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden relative">
      {/* Header */}
      <div className="p-4 sm:p-6 glass-dark border-b border-white/5 relative z-10 bg-black/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-cyan via-accent-blue to-accent-purple p-[1px] shadow-lg shadow-accent-cyan/20">
              <div className="w-full h-full rounded-2xl bg-surface-primary flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-accent-cyan" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tighter uppercase italic flex items-center gap-2">
                General Hall
                <Shield className="w-3.5 h-3.5 text-accent-cyan opacity-50" />
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={cn("w-2 h-2 rounded-full", realtimeStatus === 'SUBSCRIBED' ? "bg-accent-emerald animate-pulse" : "bg-accent-pink")}></div>
                <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">
                  {onlineUsersCount} NODES CONNECTED 
                  <span className={cn("ml-2 opacity-100", realtimeStatus === 'SUBSCRIBED' ? "text-accent-emerald" : "text-accent-pink")}>
                    [{realtimeStatus.toUpperCase()}]
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSearch(!showSearch)} className={cn("p-3 rounded-2xl transition-all", showSearch ? "bg-accent-cyan text-surface-primary shadow-glow-cyan" : "text-white/40 hover:text-white hover:bg-white/5")}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => setShowPinned(!showPinned)} className={cn("p-3 rounded-2xl transition-all relative", showPinned ? "bg-accent-cyan text-surface-primary shadow-glow-cyan" : "text-white/40 hover:text-white hover:bg-white/5")}>
              <Pin className="w-5 h-5" />
              {pinnedMessages.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-accent-pink rounded-full border-2 border-surface-secondary"></span>}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 py-4 border-b border-white/5 bg-black/40 z-10 relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => searchMessages(e.target.value)} 
                placeholder="Scan history for keywords..." 
                className="input-glass !bg-black/60 !py-3 !pl-12 text-sm border-white/5" 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar relative z-10 bg-black/5">
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser.id;
            const isPinned = pinnedMessages.includes(msg.id);
            const reactions = Array.from(new Set(msg.reactions?.map(r => r.emoji) || [])).map(emoji => ({
              emoji,
              count: msg.reactions?.filter(r => r.emoji === emoji).length || 0,
              me: msg.reactions?.some(r => r.emoji === emoji && r.user_id === currentUser.id)
            }));

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
                      <div className="text-[10px] font-mono text-white/40 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        <span className="text-accent-cyan mr-2">RE: @{msg.reply_message.profiles?.username}</span>
                        <span className="truncate max-w-[150px] inline-block align-bottom">{msg.reply_message.content}</span>
                      </div>
                    </div>
                  )}

                  {!isMe && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="w-6 h-6 rounded-lg bg-surface-elevated border border-white/10 flex items-center justify-center text-[10px] font-bold text-accent-cyan">
                        {msg.profiles?.username?.[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-white/50 tracking-wide uppercase italic">{msg.profiles?.username}</span>
                    </div>
                  )}

                  <div className="relative group/bubble">
                    <div className={cn(
                      "rounded-2xl px-5 py-4 transition-all duration-300 relative",
                      isMe 
                        ? "bg-gradient-to-br from-accent-cyan to-accent-blue text-surface-primary rounded-tr-none shadow-[0_10px_30px_rgba(0,212,255,0.15)]" 
                        : "glass-dark border border-white/5 text-white/90 rounded-tl-none hover:border-white/10",
                      selectedMessageId === msg.id ? 'ring-2 ring-accent-cyan/50 scale-[1.02]' : ''
                    )}>
                      {isPinned && (
                        <div className="absolute -top-3 -right-3 w-7 h-7 bg-surface-primary border border-accent-cyan/30 rounded-full flex items-center justify-center shadow-lg">
                          <Pin className="w-3.5 h-3.5 text-accent-cyan fill-accent-cyan" />
                        </div>
                      )}
                      
                      {msg.file_url && (
                        <div className="mb-4 overflow-hidden rounded-xl bg-black/20 border border-white/5">
                          {msg.file_type?.startsWith('image/') ? (
                            <img src={getFileUrl(msg.file_url)} alt="" className="max-w-full h-auto max-h-[300px] object-contain cursor-pointer transition-transform hover:scale-105" onClick={() => window.open(getFileUrl(msg.file_url!), '_blank')} />
                          ) : (
                            <div className="p-4 flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-accent-cyan">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono">{msg.file_type?.split('/')[1]}</p>
                              </div>
                              <a href={getFileUrl(msg.file_url)} download className="p-2.5 hover:bg-white/10 rounded-xl text-accent-cyan"><Download className="w-5 h-5" /></a>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {editingId === msg.id ? (
                        <div className="flex flex-col gap-3 min-w-[200px]">
                          <input 
                            ref={editInputRef} 
                            type="text" 
                            value={editContent} 
                            onChange={(e) => setEditContent(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} 
                            className="bg-transparent border-b border-white/20 outline-none py-2 text-sm focus:border-accent-cyan transition-colors" 
                            autoFocus 
                          />
                          <div className="flex justify-end gap-3">
                            <button onClick={(e) => { e.stopPropagation(); handleUpdate(); }} className="text-[9px] font-mono font-bold uppercase tracking-widest text-accent-cyan hover:underline">UPDATE_STREAM</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-[9px] font-mono font-bold uppercase tracking-widest opacity-40 hover:underline">ABORT</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[15px] leading-relaxed tracking-tight whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>

                    {/* Action Tools */}
                    <div className={cn(
                      "absolute -top-14 transition-all duration-300 flex items-center gap-1.5 glass-dark p-1.5 rounded-2xl border border-white/10 shadow-2xl z-20",
                      isMe ? 'right-0' : 'left-0',
                      selectedMessageId === msg.id ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none sm:group-hover/bubble:opacity-100 sm:group-hover/bubble:translate-y-0 sm:group-hover/bubble:pointer-events-auto'
                    )}>
                      <button onClick={(e) => { e.stopPropagation(); setReplyTo(msg); setSelectedMessageId(null); }} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-cyan transition-colors" title="Reply"><MessageCircle className="w-4.5 h-4.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id); }} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-cyan transition-colors" title="React"><Smile className="w-4.5 h-4.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); togglePin(msg.id); setSelectedMessageId(null); }} className={cn("p-2.5 rounded-xl transition-colors", isPinned ? 'text-accent-cyan bg-accent-cyan/10' : 'text-white/40 hover:text-white hover:bg-white/5')} title="Pin"><Pin className="w-4.5 h-4.5" /></button>
                      {isMe && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); setEditingId(msg.id); setEditContent(msg.content || ''); setSelectedMessageId(null); }} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-cyan transition-colors" title="Edit"><Edit3 className="w-4.5 h-4.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); setSelectedMessageId(null); }} className="p-2.5 hover:bg-accent-pink/5 rounded-xl text-white/40 hover:text-accent-pink transition-colors" title="Delete"><Trash2 className="w-4.5 h-4.5" /></button>
                        </>
                      )}
                    </div>

                    {showEmojiPicker === msg.id && (
                      <motion.div initial={{ scale: 0.9, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} className={cn("absolute bottom-full mb-4 z-50 glass-dark border border-white/10 p-2 rounded-2xl flex gap-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-x-auto max-w-[300px]", isMe ? 'right-0' : 'left-0')}>
                        {EMOJI_OPTIONS.map(emoji => (
                          <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); setSelectedMessageId(null); }} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-all text-xl shrink-0 hover:scale-125">{emoji}</button>
                        ))}
                      </motion.div>
                    )}
                  </div>

                  {reactions.length > 0 && (
                    <div className={cn("flex flex-wrap gap-1.5 mt-3", isMe ? 'justify-end' : 'justify-start')}>
                      {reactions.map(r => (
                        <button key={r.emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, r.emoji); }} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all", r.me ? 'bg-accent-cyan/10 border-accent-cyan/50 text-accent-cyan shadow-[0_0_10px_rgba(0,212,255,0.2)]' : 'bg-black/20 border-white/5 text-white/40 hover:border-white/20')}>
                          <span>{r.emoji}</span>
                          <span className="opacity-80">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 glass-dark border-t border-white/5 bg-black/40 z-10 relative">
        <AnimatePresence>
          {(replyTo || selectedFile) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-4 overflow-hidden">
              <div className="p-4 glass-card bg-accent-cyan/5 border-accent-cyan/20 flex items-start justify-between rounded-2xl border-l-4 border-l-accent-cyan">
                <div className="flex gap-4 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 flex items-center justify-center shrink-0">
                    {replyTo ? <MessageCircle className="w-5 h-5 text-accent-cyan" /> : <Paperclip className="w-5 h-5 text-accent-cyan" />}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <p className="text-[10px] font-mono font-bold text-accent-cyan uppercase tracking-widest mb-1">{replyTo ? `REPLYING TO @${replyTo.profiles?.username}` : 'FILE_ATTACHMENT'}</p>
                    <p className="text-sm text-white/60 truncate italic">{replyTo ? replyTo.content : selectedFile?.name}</p>
                  </div>
                </div>
                <button onClick={() => { setReplyTo(null); setSelectedFile(null); }} className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-pink transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-3 items-end max-w-6xl mx-auto">
          <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 rounded-2xl hover:bg-white/5 text-white/40 hover:text-accent-cyan transition-all mb-0.5"><Paperclip className="w-6 h-6" /></button>
          <div className="flex-1 relative group">
            <div className="absolute inset-0 bg-accent-cyan/5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl pointer-events-none" />
            <input 
              type="text" 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)} 
              placeholder={uploading ? "Broadcasting to Hall..." : "Enter transmission..."} 
              className="input-glass !bg-black/60 !py-4 !px-6 text-base !border-white/10 focus:!border-accent-cyan/50 focus:!ring-accent-cyan/10 transition-all placeholder:text-white/20" 
              disabled={uploading} 
            />
          </div>
          <button 
            type="submit" 
            disabled={(!newMessage.trim() && !selectedFile) || uploading} 
            className={cn(
              "p-4 rounded-2xl font-bold flex items-center justify-center transition-all mb-0.5 shadow-2xl group",
              (!newMessage.trim() && !selectedFile) || uploading
                ? "bg-white/5 text-white/20"
                : "bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary shadow-accent-cyan/20 hover:shadow-accent-cyan/40 hover:scale-105 active:scale-95"
            )}
          >
            {uploading ? (
              <div className="w-6 h-6 border-2 border-surface-primary/20 border-t-surface-primary rounded-full animate-spin" />
            ) : (
              <Send className="w-6 h-6 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            )}
          </button>
        </form>
      </div>

      {/* Pinned Side Panel */}
      <AnimatePresence>
        {showPinned && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPinned(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute right-0 top-0 bottom-0 w-full sm:w-96 glass-dark border-l border-white/5 z-50 shadow-2xl flex flex-col bg-black/60 backdrop-blur-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <Pin className="w-5 h-5 text-accent-cyan" />
                  <h3 className="font-bold text-lg tracking-tighter uppercase italic">Pinned Stream</h3>
                </div>
                <button onClick={() => setShowPinned(false)} className="p-2.5 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {pinnedList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                    <Pin className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-xs uppercase font-mono tracking-[0.3em]">No data artifacts pinned</p>
                  </div>
                ) : (
                  pinnedList.map(msg => (
                    <div key={msg.id} className="glass-card p-5 relative group/pin hover:border-accent-cyan/30 transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-white/10 flex items-center justify-center text-[10px] font-bold text-accent-cyan">
                           {msg.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="font-bold text-sm text-accent-cyan uppercase italic tracking-wide">@{msg.profiles?.username}</span>
                      </div>
                      <p className="text-white/70 text-sm leading-relaxed line-clamp-4 italic">"{msg.content}"</p>
                      <button onClick={() => togglePin(msg.id)} className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover/pin:opacity-100 transition-all hover:bg-red-500 hover:text-white">
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
    </div>
  );
}
