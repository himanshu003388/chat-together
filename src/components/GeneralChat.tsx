import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, FileText, X, Download,
  MessageCircle, Pin, Trash2, Edit3, Search, Smile
} from 'lucide-react';

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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const chatService = useMemo(() => new ChatService(supabase), []);

  useEffect(() => {
    fetchMessages();
    fetchPinnedMessages();
    updateOnlineStatus();

    const channel = supabase
      .channel('general-chat-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: 'receiver_id=is.null'
      }, () => {
        fetchMessages(); // Simple refresh for consistency, can be optimized later
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'reactions'
      }, () => {
        fetchMessages();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pinned_messages'
      }, () => {
        fetchPinnedMessages();
      })
      .subscribe();

    const presenceInterval = setInterval(updateOnlineStatus, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(presenceInterval);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, filteredMessages]);

  const updateOnlineStatus = async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', fiveMinutesAgo);
    setOnlineUsersCount(count || 0);
  };

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

      await chatService.sendMessage(
        currentUser.id,
        newMessage.trim() || null,
        null, // No chat_id for general
        null, // No receiver_id for general
        replyTo?.id || null,
        fileInfo
      );

      setNewMessage('');
      setReplyTo(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert('Failed to send message: ' + err.message);
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

  const getFileUrl = (path: string) => {
    return `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;
  };

  const displayMessages = filteredMessages || messages;
  const pinnedList = messages.filter(m => pinnedMessages.includes(m.id));

  return (
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden relative">
      {/* Header */}
      <div className="p-4 border-b border-white/5 glass">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">General Hall</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 bg-accent-emerald rounded-full animate-pulse"></span>
                <p className="text-xs text-white/40 font-mono">{onlineUsersCount} members online</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSearch(!showSearch)} className={`p-2.5 rounded-lg transition-all ${showSearch ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-white/40 hover:text-white'}`}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => setShowPinned(!showPinned)} className={`p-2.5 rounded-lg transition-all ${showPinned ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-white/40 hover:text-white'}`}>
              <Pin className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="px-4 py-3 border-b border-white/5 bg-white/5">
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => searchMessages(e.target.value)} 
              placeholder="Filter conversations..." 
              className="input-glass !py-2 text-sm" 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg) => {
            const isMe = msg.sender_id === currentUser.id;
            const isPinned = pinnedMessages.includes(msg.id);
            const reactions = Array.from(new Set(msg.reactions?.map(r => r.emoji) || [])).map(emoji => ({
              emoji,
              count: msg.reactions?.filter(r => r.emoji === emoji).length || 0,
              me: msg.reactions?.some(r => r.emoji === emoji && r.user_id === currentUser.id)
            }));

            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group/msg`}>
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                  
                  {msg.reply_message && (
                    <div className="flex items-center gap-2 mb-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
                      <div className="text-[10px] font-medium text-white/60 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                        <span className="text-accent-cyan mr-1">@{msg.reply_message.profiles?.username}</span>
                        {msg.reply_message.content}
                      </div>
                    </div>
                  )}

                  {!isMe && (
                    <div className="flex items-center gap-2 mb-2 ml-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center text-[10px] font-bold">
                        {msg.profiles?.username?.[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-white/70">{msg.profiles?.username}</span>
                    </div>
                  )}

                  <div className="relative group/bubble">
                    <div className={`rounded-2xl px-4 py-3 transition-all relative ${isMe ? 'bg-gradient-to-br from-accent-cyan to-accent-blue text-surface-primary shadow-lg shadow-accent-cyan/10' : 'bg-surface-elevated border border-white/5'}`}>
                      {isPinned && <Pin className="absolute -top-2 -right-2 w-4 h-4 text-accent-cyan fill-accent-cyan" />}
                      
                      {msg.file_url && (
                        <div className="mb-2 overflow-hidden rounded-xl bg-black/10">
                          {msg.file_type?.startsWith('image/') ? (
                            <img src={getFileUrl(msg.file_url)} alt="" className="max-w-full h-auto max-h-[300px] object-contain cursor-pointer" onClick={() => window.open(getFileUrl(msg.file_url!), '_blank')} />
                          ) : (
                            <div className="p-3 flex items-center gap-3">
                              <FileText className="w-5 h-5" />
                              <div className="flex-1 overflow-hidden">
                                <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                <p className="text-[10px] opacity-50 uppercase">{msg.file_type?.split('/')[1]}</p>
                              </div>
                              <a href={getFileUrl(msg.file_url)} download className="p-2 hover:bg-white/10 rounded-lg"><Download className="w-4 h-4" /></a>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {editingId === msg.id ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <input ref={editInputRef} type="text" value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} className="bg-transparent border-b border-white/20 outline-none py-1 text-sm" />
                          <div className="flex justify-end gap-2">
                            <button onClick={handleUpdate} className="text-[10px] font-bold uppercase tracking-widest underline">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-[10px] font-bold uppercase tracking-widest opacity-50 underline">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>

                    {/* Action Tools */}
                    <div className={`absolute top-0 ${isMe ? '-left-[140px]' : '-right-[140px]'} opacity-0 group-hover/bubble:opacity-100 transition-all flex items-center gap-1 bg-surface-secondary/90 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl z-20`}>
                      <button onClick={() => setReplyTo(msg)} className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white" title="Reply"><MessageCircle className="w-4 h-4" /></button>
                      <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white" title="React"><Smile className="w-4 h-4" /></button>
                      <button onClick={() => togglePin(msg.id)} className={`p-2 rounded-xl ${isPinned ? 'text-accent-cyan bg-accent-cyan/10' : 'text-white/40 hover:text-white'}`} title="Pin"><Pin className="w-4 h-4" /></button>
                      {isMe && (
                        <>
                          <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content || ''); }} className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white" title="Edit"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => deleteMessage(msg.id)} className="p-2 hover:bg-red-500/10 rounded-xl text-white/40 hover:text-red-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>

                    {showEmojiPicker === msg.id && (
                      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`absolute bottom-full mb-3 ${isMe ? 'right-0' : 'left-0'} z-50 bg-surface-secondary border border-white/10 p-2 rounded-2xl flex gap-1 shadow-2xl`}>
                        {EMOJI_OPTIONS.map(emoji => (
                          <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-xl">{emoji}</button>
                        ))}
                      </motion.div>
                    )}
                  </div>

                  {reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {reactions.map(r => (
                        <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${r.me ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}>
                          <span>{r.emoji}</span>
                          <span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 bg-surface-primary/50 backdrop-blur-md">
        <AnimatePresence>
          {(replyTo || selectedFile) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 bg-white/5 rounded-2xl p-3 flex items-start justify-between border-l-4 border-accent-cyan">
              <div className="flex gap-3">
                {replyTo ? <MessageCircle className="w-4 h-4 text-accent-cyan mt-1" /> : <Paperclip className="w-4 h-4 text-accent-cyan mt-1" />}
                <div>
                  <p className="text-[10px] font-bold text-accent-cyan uppercase tracking-widest mb-1">{replyTo ? `Replying to ${replyTo.profiles?.username}` : 'File Attached'}</p>
                  <p className="text-xs text-white/60 line-clamp-1">{replyTo ? replyTo.content : selectedFile?.name}</p>
                </div>
              </div>
              <button onClick={() => { setReplyTo(null); setSelectedFile(null); }} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4 text-white/40" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3.5 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all"><Paperclip className="w-5 h-5" /></button>
          <div className="flex-1">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={uploading ? "Broadcasting signal..." : "Type your message..."} className="input-glass !py-3.5 !rounded-2xl" disabled={uploading} />
          </div>
          <button type="submit" disabled={(!newMessage.trim() && !selectedFile) || uploading} className="p-3.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-white font-bold shadow-lg shadow-accent-cyan/20 transition-all disabled:opacity-30">
            {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>

      {/* Pinned Side Panel Overlay */}
      <AnimatePresence>
        {showPinned && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute right-0 top-0 bottom-0 w-80 bg-surface-secondary border-l border-white/5 z-50 shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h3 className="font-bold text-sm uppercase tracking-widest text-white/60">Pinned Data</h3>
              <button onClick={() => setShowPinned(false)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {pinnedList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20"><Pin className="w-12 h-12 mb-2" /><p className="text-xs uppercase font-bold">No Pins Found</p></div>
              ) : (
                pinnedList.map(msg => (
                  <div key={msg.id} className="glass-card p-3 text-xs relative group/pin">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-accent-cyan">@{msg.profiles?.username}</span>
                    </div>
                    <p className="text-white/70 line-clamp-3">{msg.content}</p>
                    <button onClick={() => togglePin(msg.id)} className="absolute top-2 right-2 text-red-400 opacity-0 group-hover/pin:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
