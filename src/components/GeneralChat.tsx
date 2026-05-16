import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, FileText, Image as ImageIcon, X, Download,
  MessageCircle, Pin, Trash2, Edit3, Search, CheckCheck, Smile
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
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('messages')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(filePath);

      return { url: publicUrl, type: file.type, name: file.name };
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;

    let fileData = null;
    if (selectedFile) {
      fileData = await uploadFile(selectedFile);
      if (!fileData) return;
    }

    try {
      const { data, error } = await supabase.from('messages').insert({
        sender_id: currentUser.id,
        content: newMessage.trim() || null,
        reply_to: replyTo?.id || null,
        file_url: fileData?.url || null,
        file_name: fileData?.name || null,
        file_type: fileData?.type || null,
      }).select();

      if (error) {
        console.error('Message insert error:', error);
        alert('Failed to send message: ' + error.message);
        return;
      }

      // Manually add the new message to state
      if (data && data[0]) {
        const newMsg = data[0] as Message;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', currentUser.id)
          .single();
        newMsg.profiles = profile;
        newMsg.reactions = [];
        setMessages(prev => [...prev, newMsg]);
      }

      setNewMessage('');
      setReplyTo(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Send message error:', err);
      alert('Failed to send message');
    }
  };

  const togglePin = async (messageId: string) => {
    const isPinned = pinnedMessages.some(p => p.message_id === messageId);

    if (isPinned) {
      await supabase.from('pinned_messages').delete().eq('message_id', messageId);
    } else {
      await supabase.from('pinned_messages').insert({ message_id: messageId });
    }

    fetchPinnedMessages();
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const existing = await supabase
      .from('reactions')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', currentUser.id)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: currentUser.id,
        emoji,
      });
    }

    fetchMessages();
    fetchPinnedMessages();
  };

  const updateMessage = async () => {
    if (!editingId || !editContent.trim()) return;

    await supabase.from('messages').update({ content: editContent.trim() }).eq('id', editingId);
    setEditingId(null);
    setEditContent('');
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
          <img
            src={msg.file_url}
            alt=""
            className="max-w-72 rounded-xl border border-white/10 cursor-pointer transition-all hover:scale-[1.02]"
            onClick={() => window.open(msg.file_url!, '_blank')}
          />
        </motion.div>
      );
    }

    return (
      <div className={`mt-3 flex items-center gap-3 p-3 rounded-lg ${isMe ? 'bg-white/10' : 'bg-white/5'}`}>
        <FileText className="w-5 h-5 text-white/50" />
        <span className="text-sm truncate flex-1">{msg.file_name}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/10 transition-all">
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
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-lg">General</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 bg-accent-emerald rounded-full animate-pulse"></span>
                <p className="text-xs text-white/40 font-mono">
                  {onlineUsers.length} online
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2.5 rounded-lg transition-all ${showSearch ? 'bg-accent-cyan/20 text-accent-cyan' : 'hover:bg-white/10 text-white/60'}`}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowPinned(!showPinned)}
              className={`p-2.5 rounded-lg transition-all ${showPinned ? 'bg-accent-cyan/20 text-accent-cyan' : 'hover:bg-white/10 text-white/60'}`}
              aria-label="Pinned"
            >
              <Pin className="w-5 h-5" />
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
              <div className="mt-4 pt-4 border-t border-white/5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => searchMessages(e.target.value)}
                  placeholder="Search messages..."
                  className="input-glass text-sm"
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
            className="border-b border-white/5 bg-surface-secondary overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Pin className="w-4 h-4 text-accent-cyan" /> Pinned Messages
                </h3>
                <button onClick={() => setShowPinned(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {pinnedMessagesList.length === 0 ? (
                  <p className="text-sm text-white/40">No pinned messages</p>
                ) : (
                  pinnedMessagesList.map(msg => (
                    <div key={msg.id} className="p-3 glass rounded-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center text-sm font-medium">
                        {msg.profiles?.username?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-accent-cyan">{msg.profiles?.username}</span>
                        <p className="text-sm text-white/60 truncate">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite">
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUser.id;
            const isPinned = pinnedMessages.some(p => p.message_id === msg.id);

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
                className={`group flex ${isMe ? 'justify-end' : 'justify-start'} ${isPinned ? 'z-10' : ''}`}
              >
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                  {/* Sender Info */}
                  {!isMe && (
                    <div className="flex items-center gap-2 mb-2 ml-1">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-xs font-medium">
                        {msg.profiles?.username?.[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-white/70">{msg.profiles?.username}</span>
                    </div>
                  )}

                  {/* Reply Preview */}
                  {msg.reply_message && (
                    <div className={`mb-2 p-2 rounded-lg text-xs ${isMe ? 'bg-accent-cyan/10' : 'bg-white/5'}`}>
                      <span className="font-medium block mb-1 text-accent-cyan">Replying to {msg.reply_message.profiles?.username}</span>
                      <p className="truncate text-white/50">{msg.reply_message.content}</p>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`relative rounded-2xl px-4 py-3 transition-all ${
                    isMe ? 'bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary' : 'bg-surface-elevated border border-white/10'
                  } ${isPinned ? 'ring-2 ring-accent-cyan/50' : ''}`}>
                    {isPinned && <Pin className="absolute -top-2 -right-2 w-4 h-4 text-accent-cyan" />}

                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateMessage()}
                          className="bg-transparent border-b border-white/20 focus:border-white outline-none py-1 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={updateMessage} className="text-xs font-medium underline">Save</button>
                          <button onClick={cancelEdit} className="text-xs text-white/50 underline">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content && <p className="text-sm leading-relaxed">{msg.content}</p>}
                        {renderFileContent(msg, isMe)}
                      </>
                    )}
                  </div>

                  {/* Meta & Actions */}
                  <div className={`mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-white/40 font-mono">
                      {formatTime(msg.created_at)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button onClick={() => setReplyTo(msg)} className="p-1.5 rounded-lg hover:bg-white/10 transition-all"><MessageCircle className="w-3.5 h-3.5 text-white/50" /></button>
                      <button onClick={() => togglePin(msg.id)} className={`p-1.5 rounded-lg transition-all ${isPinned ? 'bg-accent-cyan/20 text-accent-cyan' : 'hover:bg-white/10 text-white/50'}`}><Pin className="w-3.5 h-3.5" /></button>
                      {isMe && (
                        <>
                          <button onClick={() => startEdit(msg)} className="p-1.5 rounded-lg hover:bg-white/10 transition-all"><Edit3 className="w-3.5 h-3.5 text-white/50" /></button>
                          <button onClick={() => deleteMessage(msg.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all"><Trash2 className="w-3.5 h-3.5 text-white/50 hover:text-red-400" /></button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                        const count = msg.reactions!.filter(r => r.emoji === emoji).length;
                        const hasReacted = msg.reactions!.some(r => r.emoji === emoji && r.user_id === currentUser.id);
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`px-2 py-1 rounded-full text-xs transition-all ${
                              hasReacted ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30' : 'bg-white/5 text-white/60 hover:bg-white/10'
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
            className="px-4 py-3 border-t border-white/5 bg-surface-secondary flex items-center gap-4"
          >
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center">
                {replyTo ? <MessageCircle className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/40">
                  {replyTo ? `Replying to ${replyTo.profiles?.username}` : 'File attached'}
                </p>
                <p className="text-sm font-medium truncate">{replyTo ? replyTo.content : selectedFile?.name}</p>
              </div>
            </div>
            <button
              onClick={() => { setReplyTo(null); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="p-2 rounded-lg hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Input */}
      <div className="p-4 border-t border-white/5">
        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
            disabled={uploading}
            aria-label="Attach"
          >
            <Paperclip className="w-5 h-5 text-white/60" />
          </button>

          <div className="flex-1 relative">
            <label htmlFor="general-message-input" className="sr-only">Message</label>
            <input
              id="general-message-input"
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="input-glass"
              disabled={uploading || !!editingId}
            />
          </div>

          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || uploading || !!editingId}
            aria-label="Send"
            className="p-3 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary font-medium hover:shadow-glow-cyan transition-all disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-5 h-5 border-2 border-surface-primary/30 border-t-surface-primary rounded-full animate-spin"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}