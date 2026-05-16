import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, User, MoreVertical, Check, CheckCheck, Phone, Video, Paperclip, X, FileText, Download } from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  last_seen: string | null;
  is_banned: boolean;
  bio?: string;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read?: boolean;
  file_url?: string;
  file_name?: string;
  file_type?: string;
}

interface ChatAppProps {
  currentUser: { id: string; email: string; username?: string };
  initialProfiles: Profile[];
  initialActiveUserId?: string;
}

export default function ChatApp({
  currentUser,
  initialProfiles,
  initialActiveUserId,
}: ChatAppProps) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [activeUserId, setActiveUserId] = useState<string | null>(initialActiveUserId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [activeUserProfile, setActiveUserProfile] = useState<Profile | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatService = useMemo(() => new ChatService(supabase), []);

  const filteredProfiles = profiles.filter((p) =>
    p.username.toLowerCase().includes(searchQuery.toLowerCase()) && !p.is_banned
  );

  useEffect(() => {
    if (activeUserId) {
      setActiveUserProfile(profiles.find((p) => p.id === activeUserId) || null);
      fetchMessages();
    } else {
      setActiveUserProfile(null);
      setMessages([]);
    }
  }, [activeUserId]);

  useEffect(() => {
    const channel = supabase
      .channel(`direct-chat-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `or(receiver_id.eq.${currentUser.id},sender_id.eq.${currentUser.id})`
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id === activeUserId || msg.receiver_id === activeUserId) {
          fetchMessages();
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === activeUserId) {
          setOtherUserTyping(payload.typing);
        }
      })
      .subscribe();

    updateLastSeen();
    const interval = setInterval(updateLastSeen, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeUserId, currentUser.id]);

  const updateLastSeen = async () => {
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
  };

  const fetchMessages = async () => {
    if (!activeUserId) return;
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages(data);
        const unread = data.filter(m => m.receiver_id === currentUser.id && !m.is_read);
        if (unread.length > 0) {
          await supabase.from('messages').update({ is_read: true }).in('id', unread.map(m => m.id));
        }
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!activeUserId) return;

    supabase.channel(`direct-chat-${activeUserId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing: true },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      supabase.channel(`direct-chat-${activeUserId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, typing: false },
      });
    }, 1500);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !activeUserId || uploading) return;

    setUploading(true);
    try {
      let fileInfo = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `direct/${currentUser.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(fileName, selectedFile);
        if (uploadError) throw uploadError;
        fileInfo = { url: fileName, name: selectedFile.name, type: selectedFile.type };
      }

      await chatService.sendMessage(currentUser.id, newMessage.trim() || null, null, activeUserId, null, fileInfo);

      // Optimistic update - add message immediately
      const newMsg: Message = {
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        sender_id: currentUser.id,
        receiver_id: activeUserId,
        content: newMessage.trim() || '',
        created_at: new Date().toISOString(),
        file_url: fileInfo?.url,
        file_name: fileInfo?.name,
        file_type: fileInfo?.type
      };
      setMessages(prev => [...prev, newMsg]);

      setNewMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const getFileUrl = (path: string) => `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherUserTyping]);

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return (Date.now() - new Date(lastSeen).getTime()) < 5 * 60 * 1000;
  };

  return (
    <div className="flex w-full h-full bg-surface-primary overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-surface-secondary border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-xl font-bold mb-4">Direct Nodes</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input type="text" placeholder="Scan users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-glass text-sm pl-9 py-2.5" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredProfiles.map((p) => (
            <button key={p.id} onClick={() => setActiveUserId(p.id)} className={`w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-all border-b border-white/5 ${activeUserId === p.id ? 'bg-white/10' : ''}`}>
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center font-bold">{p.username[0].toUpperCase()}</div>
                {isOnline(p.last_seen) && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent-emerald rounded-full border-2 border-surface-secondary"></div>}
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm">{p.username}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/30">{isOnline(p.last_seen) ? 'Active' : 'Offline'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {activeUserId && activeUserProfile ? (
          <>
            <div className="p-4 border-b border-white/5 glass flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center font-bold">{activeUserProfile.username[0].toUpperCase()}</div>
                <div>
                  <h3 className="font-bold">{activeUserProfile.username}</h3>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">{isOnline(activeUserProfile.last_seen) ? 'Link Established' : 'Signal Lost'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2.5 rounded-xl hover:bg-white/10 text-white/60"><Phone className="w-5 h-5" /></button>
                <button className="p-2.5 rounded-xl hover:bg-white/10 text-white/60"><Video className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center opacity-20 animate-pulse font-mono text-xs uppercase tracking-widest">Decoding Stream...</div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === currentUser.id;
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                        <div className={`rounded-2xl px-4 py-3 ${isMe ? 'bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary shadow-lg shadow-accent-cyan/10' : 'bg-surface-elevated border border-white/5'}`}>
                          {msg.file_url && (
                            <div className="mb-2 rounded-xl overflow-hidden bg-black/10">
                              {msg.file_type?.startsWith('image/') ? (
                                <img src={getFileUrl(msg.file_url)} className="max-w-full h-auto max-h-60 object-contain cursor-pointer" onClick={() => window.open(getFileUrl(msg.file_url!), '_blank')} />
                              ) : (
                                <div className="p-3 flex items-center gap-3">
                                  <FileText className="w-5 h-5" />
                                  <div className="flex-1 overflow-hidden">
                                    <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                    <a href={getFileUrl(msg.file_url)} download className="text-[10px] text-accent-cyan underline">Download</a>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                           <span className="text-[9px] text-white/20 font-mono">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                           {isMe && (msg.is_read ? <CheckCheck className="w-3 h-3 text-accent-cyan" /> : <Check className="w-3 h-3 text-white/20" />)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              {otherUserTyping && <div className="text-[10px] text-accent-cyan font-bold uppercase tracking-widest animate-pulse">{activeUserProfile.username} is encoding message...</div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/5 bg-surface-primary/50 backdrop-blur-md">
              <AnimatePresence>
                {selectedFile && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="mb-3 p-3 glass-card flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Paperclip className="w-4 h-4 text-accent-cyan" />
                      <span className="text-xs font-bold truncate max-w-xs">{selectedFile.name}</span>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
                  </motion.div>
                )}
              </AnimatePresence>
              <form onSubmit={handleSend} className="flex gap-3 items-end">
                <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3.5 rounded-xl hover:bg-white/5 text-white/40"><Paperclip className="w-5 h-5" /></button>
                <div className="flex-1">
                  <input type="text" value={newMessage} onChange={handleTyping} placeholder="Enter protocol data..." className="input-glass !py-3.5" disabled={uploading} />
                </div>
                <button type="submit" disabled={(!newMessage.trim() && !selectedFile) || uploading} className="p-3.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-white shadow-lg shadow-accent-cyan/20">
                  {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <User className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-bold uppercase tracking-widest">Select Signal Source</h3>
          </div>
        )}
      </div>
    </div>
  );
}
