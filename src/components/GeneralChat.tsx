import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, FileText, Image as ImageIcon, X, Download,
  Smile, MessageCircle, Pin, PinOff, Trash2, Edit3, Check,
  ChevronLeft, Users, Hash, MoreVertical, Heart, ThumbsUp,
  ThumbsDown, Laugh, Angry, UserPlus, Search, CheckCheck
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

interface PinnedMessage {
  message_id: string;
}

interface GeneralChatProps {
  currentUser: { id: string; email: string; username?: string };
}

const EMOJI_OPTIONS = ['❤️', '👍', '👎', '😂', '😡', '🎉', '🔥', '💯'];

export default function GeneralChat({ currentUser }: GeneralChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMessages, setFilteredMessages] = useState<Message[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMessages();
    fetchPinnedMessages();
    fetchOnlineUsers();

    const channel = supabase
      .channel('general-chat-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'receiver_id=is.null'
      }, async (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.receiver_id !== null) return;
        await attachProfileAndReactions(newMsg);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const deleted = payload.old as { id: string };
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, filteredMessages]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const attachProfileAndReactions = async (msg: Message) => {
    const { data: profile } = await supabase
      .from('profiles').select('id, username, avatar_url')
      .eq('id', msg.sender_id).single();

    const { data: reactions } = await supabase
      .from('reactions').select('*')
      .eq('message_id', msg.id);

    if (msg.reply_to) {
      const { data: replyMsg } = await supabase
        .from('messages').select('*, profiles:sender_id(id, username, avatar_url)')
        .eq('id', msg.reply_to).single();
      msg.reply_message = replyMsg as unknown as Message;
    }

    msg.profiles = profile || undefined;
    msg.reactions = reactions || [];

    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(id, username, avatar_url)')
      .is('receiver_id', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      const messagesWithReactions = await Promise.all(
        (data as unknown as Message[]).map(async (msg) => {
          const { data: reactions } = await supabase
            .from('reactions').select('*').eq('message_id', msg.id);
            
          let reply_message = undefined;
          if (msg.reply_to) {
            const { data: replyMsg } = await supabase
              .from('messages').select('*, profiles:sender_id(id, username, avatar_url)')
              .eq('id', msg.reply_to).single();
            reply_message = replyMsg;
          }
            
          return { ...msg, reactions: reactions || [], reply_message };
        })
      );
      setMessages(messagesWithReactions);
    }
  };

  const fetchPinnedMessages = async () => {
    const { data } = await supabase
      .from('pinned_messages')
      .select('message_id');

    if (data) setPinnedMessages(data);
  };

  const fetchOnlineUsers = async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .gte('last_seen', fiveMinutesAgo);

    if (data) setOnlineUsers(data.map(p => p.id));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      const { error } = await supabase.storage
        .from('chat-attachments').upload(filePath, file);

      if (error) throw error;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
      return { url: data.publicUrl, name: file.name, type: file.type };
    } catch (err) {
      console.error('Upload error:', err);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed && !selectedFile) return;

    let fileData = null;
    if (selectedFile) {
      fileData = await uploadFile(selectedFile);
      if (!fileData && !trimmed) return;
    }

    await supabase.from('messages').insert({
      sender_id: currentUser.id,
      receiver_id: null,
      content: trimmed || null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      reply_to: replyTo?.id || null,
    });

    setNewMessage('');
    setSelectedFile(null);
    setReplyTo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateMessage();
    } else {
      await sendMessage();
    }
  };

  const updateMessage = async () => {
    if (!editingId || !editContent.trim()) return;

    await supabase.from('messages')
      .update({ content: editContent.trim() })
      .eq('id', editingId);

    setEditingId(null);
    setEditContent('');
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('EXECUTE DELETE COMMAND?')) return;
    await supabase.from('messages').delete().eq('id', id);
    await supabase.from('reactions').delete().eq('message_id', id);
    await supabase.from('pinned_messages').delete().eq('message_id', id);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const existing = messages.find(m => m.id === messageId)?.reactions
      ?.find(r => r.emoji === emoji && r.user_id === currentUser.id);

    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: currentUser.id,
        emoji
      });
    }

    fetchMessages();
  };

  const togglePin = async (messageId: string) => {
    const isPinned = pinnedMessages.some(p => p.message_id === messageId);

    if (isPinned) {
      await supabase.from('pinned_messages').delete().eq('message_id', messageId);
    } else {
      await supabase.from('pinned_messages').insert({
        message_id: messageId,
        pinned_by: currentUser.id
      });
    }

    fetchPinnedMessages();
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
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

  const formatTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const renderFileContent = (msg: Message, isMe: boolean) => {
    if (!msg.file_url) return null;
    const isImage = msg.file_type?.startsWith('image/');
    
    if (isImage) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
          <img
            src={msg.file_url}
            alt=""
            className="max-w-full elite-border cursor-pointer transition-all hover:scale-[1.02]"
            onClick={() => window.open(msg.file_url!, '_blank')}
          />
        </motion.div>
      );
    }

    return (
      <div className={`mt-4 flex items-center gap-4 p-4 elite-border ${isMe ? 'bg-white/10' : 'bg-elite-neutral-50'}`}>
        <FileText className="w-6 h-6" />
        <span className="text-[10px] font-black uppercase truncate flex-1 tracking-tighter">{msg.file_name}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="p-2 elite-border hover:bg-elite-black hover:text-white transition-all">
          <Download className="w-4 h-4" />
        </a>
      </div>
    );
  };

  const displayMessages = filteredMessages || messages;
  const pinnedMessagesList = messages.filter(m =>
    pinnedMessages.some(p => p.message_id === m.id)
  );

  return (
    <div className="flex flex-col h-full bg-white elite-border overflow-hidden">
      {/* Header */}
      <div className="p-8 border-b border-elite-black bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 elite-border flex items-center justify-center bg-elite-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
              <Hash className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-black text-2xl uppercase tracking-tightest">General Node</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <p className="text-[10px] font-mono font-bold text-elite-neutral-400 uppercase tracking-[0.2em]">
                  {onlineUsers.length} ACTIVE SIGNALS
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-3 elite-border transition-all ${showSearch ? 'bg-elite-black text-white' : 'hover:bg-elite-neutral-50'}`}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowPinned(!showPinned)}
              className={`p-3 elite-border transition-all ${showPinned ? 'bg-elite-black text-white' : 'hover:bg-elite-neutral-50'}`}
              aria-label="Pinned"
            >
              <Pin className="w-5 h-5" />
            </button>
            <button className="p-3 elite-border hover:bg-elite-neutral-50 transition-all" aria-label="Members">
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSearch && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-8 pt-8 border-t border-elite-neutral-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => searchMessages(e.target.value)}
                  placeholder="FILTER DATA TRANSMISSIONS..."
                  className="w-full px-6 py-4 elite-border bg-elite-neutral-50 focus:bg-white transition-all outline-none font-black text-[10px] tracking-[0.3em] uppercase"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pinned Messages Panel */}
      <AnimatePresence>
        {showPinned && (
          <motion.div 
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="border-b border-elite-black bg-elite-neutral-50 overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-[10px] uppercase tracking-[0.4em] flex items-center gap-3">
                  <Pin className="w-4 h-4 text-elite-black" /> SECURED SIGNALS
                </h3>
                <button onClick={() => setShowPinned(false)} className="p-2 elite-border hover:bg-elite-black hover:text-white transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                {pinnedMessagesList.map(msg => (
                  <div key={msg.id} className="p-4 bg-white elite-border flex items-start gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]">
                    <div className="w-8 h-8 elite-border flex-shrink-0 flex items-center justify-center text-[10px] font-black bg-elite-black text-white">
                      {msg.profiles?.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[8px] font-mono font-bold text-elite-black uppercase">{msg.profiles?.username}</span>
                      <p className="text-xs font-medium text-elite-neutral-600 truncate">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-white selection:bg-elite-black selection:text-white" role="log" aria-live="polite">
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser.id;
            const isPinned = pinnedMessages.some(p => p.message_id === msg.id);

            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
                className={`group relative flex ${isMe ? 'justify-end' : 'justify-start'} ${isPinned ? 'z-10' : ''}`}
              >
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  {/* Sender Info */}
                  {!isMe && (
                    <div className="flex items-center gap-3 mb-3 ml-1">
                      <div className="w-6 h-6 elite-border flex items-center justify-center bg-elite-black text-white text-[8px] font-black">
                        {msg.profiles?.username?.[0].toUpperCase()}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest">{msg.profiles?.username}</span>
                    </div>
                  )}

                  {/* Reply Preview */}
                  {msg.reply_message && (
                    <div className={`mb-2 p-3 elite-border text-[10px] font-medium opacity-60 border-b-0 ${isMe ? 'bg-elite-neutral-50' : 'bg-white'}`}>
                      <span className="font-black uppercase tracking-tighter block mb-1">RE: {msg.reply_message.profiles?.username}</span>
                      <p className="truncate italic">{msg.reply_message.content}</p>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`relative elite-border px-6 py-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${
                    isMe ? 'bg-elite-black text-white' : 'bg-white text-elite-black'
                  } ${isPinned ? 'ring-4 ring-elite-black ring-offset-2' : ''}`}>
                    {isPinned && <Pin className="absolute -top-3 -right-3 w-6 h-6 bg-white elite-border p-1.5" />}
                    
                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-4 min-w-[200px]">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateMessage()}
                          className={`bg-transparent border-b-2 border-white/20 focus:border-white outline-none py-1 text-sm font-bold uppercase ${isMe ? 'text-white' : 'text-elite-black border-elite-black/20 focus:border-elite-black'}`}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={updateMessage} className="text-[8px] font-black uppercase underline">COMMIT</button>
                          <button onClick={cancelEdit} className="text-[8px] font-black uppercase underline opacity-50">ABORT</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content && <p className="text-sm font-bold leading-relaxed tracking-tight uppercase">{msg.content}</p>}
                        {renderFileContent(msg, isMe)}
                      </>
                    )}
                  </div>

                  {/* Meta & Actions */}
                  <div className={`mt-4 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all duration-200 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[8px] font-mono font-bold text-elite-neutral-400 uppercase">
                      {formatTime(msg.created_at)}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <button onClick={() => setReplyTo(msg)} className="p-1.5 hover:bg-elite-black hover:text-white elite-border transition-all"><MessageCircle className="w-3.5 h-3.5" /></button>
                      <button onClick={() => togglePin(msg.id)} className={`p-1.5 elite-border transition-all ${isPinned ? 'bg-elite-black text-white' : 'hover:bg-elite-black hover:text-white'}`}><Pin className="w-3.5 h-3.5" /></button>
                      {isMe && (
                        <>
                          <button onClick={() => startEdit(msg)} className="p-1.5 hover:bg-elite-black hover:text-white elite-border transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteMessage(msg.id)} className="p-1.5 hover:bg-red-500 hover:text-white elite-border border-red-500 text-red-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-2 mt-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                        const count = msg.reactions!.filter(r => r.emoji === emoji).length;
                        const hasReacted = msg.reactions!.some(r => r.emoji === emoji && r.user_id === currentUser.id);
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`px-3 py-1 elite-border text-[10px] font-black transition-all ${
                              hasReacted ? 'bg-elite-black text-white' : 'bg-white text-elite-black hover:bg-elite-neutral-50'
                            }`}
                          >
                            {emoji} {count}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Contexts */}
      <AnimatePresence>
        {(replyTo || selectedFile) && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="px-8 py-4 border-t border-elite-black bg-elite-neutral-50 flex items-center gap-6"
          >
            <div className="flex-1 min-w-0 flex items-center gap-4">
              <div className="w-10 h-10 elite-border flex items-center justify-center bg-elite-black text-white">
                {replyTo ? <MessageCircle className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-elite-neutral-400">
                  {replyTo ? `RESPONDING TO ${replyTo.profiles?.username}` : 'FILE ATTACHMENT READY'}
                </p>
                <p className="text-[10px] font-bold truncate uppercase">{replyTo ? replyTo.content : selectedFile?.name}</p>
              </div>
            </div>
            <button 
              onClick={() => { setReplyTo(null); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="p-3 elite-border hover:bg-elite-black hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Input */}
      <div className="p-8 bg-white border-t border-elite-black">
        <form onSubmit={handleSend} className="flex gap-6 items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="elite-button !p-4 disabled:opacity-20"
            disabled={uploading}
            aria-label="Attach"
          >
            <Paperclip className="w-6 h-6" />
          </button>

          <div className="flex-1 relative group">
            <label htmlFor="general-message-input" className="sr-only">Input Signal</label>
            <input
              id="general-message-input"
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="TYPE SIGNAL..."
              className="w-full px-8 py-5 elite-border bg-elite-neutral-50 focus:bg-white focus:ring-12 focus:ring-elite-black/5 transition-all outline-none font-black text-xs uppercase tracking-tighter"
              disabled={uploading || !!editingId}
            />
          </div>

          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || uploading || !!editingId}
            aria-label="Execute"
            className="elite-button bg-elite-black text-white !h-[60px] !w-20 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-1 hover:-translate-y-1"
          >
            {uploading ? (
              <div className="w-6 h-1 bg-white animate-pulse mx-auto"></div>
            ) : (
              <Send className="w-6 h-6 mx-auto" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}