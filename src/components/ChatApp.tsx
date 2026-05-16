import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { ChatService } from '../services/chat.service';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, User, MoreVertical, Check, CheckCheck, Phone, Video, Paperclip, X, FileText, Download, ChevronLeft, MessageCircle, Zap, Shield, Cpu } from 'lucide-react';
import ThreeBackground from './ThreeBackground';
import TiltCard from './TiltCard';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  last_seen: string | null;
  is_banned: boolean;
  bio?: string;
  created_at?: string;
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
  const [showProfileModal, setShowProfileModal] = useState<Profile | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('connecting');
  const [pulse, setPulse] = useState(false);
  
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
    const messagesChannel = supabase
      .channel('direct-messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          const msg = (payload.new || payload.old) as Message;
          if (!msg.chat_id && (msg.sender_id === currentUser.id || msg.receiver_id === currentUser.id)) {
            fetchMessages();
          }
        }
      })
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    const presenceChannel = supabase.channel('direct-presence');
    
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        // Presence sync logic
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === activeUserId) {
          setOtherUserTyping(payload.typing);
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
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [activeUserId, currentUser.id]);

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

    setPulse(true);
    setTimeout(() => setPulse(false), 500);

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

      const tempId = 'temp-' + Date.now().toString() + Math.random().toString(36).substring(7);
      const newMsg: Message = {
        id: tempId,
        sender_id: currentUser.id,
        receiver_id: activeUserId,
        content: newMessage.trim() || '',
        created_at: new Date().toISOString(),
        file_url: fileInfo?.url,
        file_name: fileInfo?.name,
        file_type: fileInfo?.type
      };
      setMessages(prev => [...prev, newMsg]);
      fetchMessages();

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
    <div className="flex w-full h-full bg-surface-primary/20 backdrop-blur-[2px] overflow-hidden relative noise-overlay">
      <ThreeBackground pulse={pulse} />
      
      {/* Sidebar */}
      <div className={cn(
        "z-10 w-full md:w-96 glass-dark border-r border-white/5 flex flex-col transition-all duration-500",
        !showMobileList && activeUserId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-accent-cyan animate-pulse" />
              <h2 className="text-xl font-bold tracking-tighter uppercase italic">Nodes</h2>
            </div>
            <div className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-mono border",
              realtimeStatus === 'SUBSCRIBED' ? "text-accent-emerald border-accent-emerald/30 bg-accent-emerald/10" : "text-accent-pink border-accent-pink/30 bg-accent-pink/10"
            )}>
              {realtimeStatus === 'SUBSCRIBED' ? 'ENCRYPTED' : 'SYNCING'}
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent-cyan transition-colors" />
            <input 
              type="text" 
              placeholder="Scan for active nodes..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="input-glass !bg-black/40 text-sm pl-10 py-3 border-white/5 hover:border-white/10 transition-all" 
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredProfiles.map((p) => (
            <button 
              key={p.id} 
              onClick={() => { setActiveUserId(p.id); setShowMobileList(false); }} 
              className={cn(
                "w-full p-4 flex items-center gap-4 transition-all border-b border-white/5 relative overflow-hidden group",
                activeUserId === p.id ? 'bg-accent-cyan/[0.07] border-l-2 border-l-accent-cyan' : 'hover:bg-white/[0.03]'
              )}
            >
              <div className="relative shrink-0">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all transform group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-black/40",
                  activeUserId === p.id ? "bg-accent-cyan text-surface-primary" : "bg-surface-elevated text-white/70"
                )}>
                  {p.username[0].toUpperCase()}
                </div>
                {isOnline(p.last_seen) && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent-emerald rounded-full border-4 border-surface-secondary shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="font-bold text-sm tracking-wide group-hover:text-accent-cyan transition-colors">{p.username}</span>
                  <span className="text-[10px] text-white/20 font-mono">ID: {p.id.slice(0, 4)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full", isOnline(p.last_seen) ? "bg-accent-emerald animate-pulse" : "bg-white/10")}></div>
                  <span className="text-[10px] uppercase tracking-widest text-white/30">{isOnline(p.last_seen) ? 'Active' : 'Offline'}</span>
                </div>
              </div>
              {activeUserId === p.id && (
                <motion.div layoutId="active-indicator" className="absolute right-0 top-0 bottom-0 w-1 bg-accent-cyan shadow-[0_0_15px_rgba(0,212,255,0.5)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col relative z-10 transition-all duration-500",
        activeUserId ? 'w-full md:w-auto' : 'w-full'
      )}>
        {activeUserId && activeUserProfile ? (
          <>
            {/* Chat Header */}
            <div className="p-4 sm:p-6 glass-dark border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowProfileModal(activeUserProfile)} className="relative group shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-cyan via-accent-blue to-accent-purple p-[1px] shadow-lg shadow-accent-cyan/10">
                    <div className="w-full h-full rounded-2xl bg-surface-primary flex items-center justify-center font-bold text-lg group-hover:scale-95 transition-transform">
                      {activeUserProfile.username[0].toUpperCase()}
                    </div>
                  </div>
                  <div className={cn(
                    "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-surface-secondary",
                    isOnline(activeUserProfile.last_seen) ? "bg-accent-emerald shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-white/20"
                  )}></div>
                </button>
                <div>
                  <button onClick={() => setShowProfileModal(activeUserProfile)} className="font-bold text-lg hover:text-accent-cyan transition-colors flex items-center gap-2">
                    {activeUserProfile.username}
                    <Shield className="w-3.5 h-3.5 text-accent-cyan opacity-50" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Zap className={cn("w-3 h-3", isOnline(activeUserProfile.last_seen) ? "text-accent-emerald animate-pulse" : "text-white/20")} />
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">
                      {isOnline(activeUserProfile.last_seen) ? 'Secure Link Active' : 'Signal Lost / Inactive'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowMobileList(true); setActiveUserId(null); }} className="md:hidden p-3 rounded-2xl hover:bg-white/5 text-white/60 hover:text-accent-cyan transition-all"><ChevronLeft className="w-5 h-5" /></button>
                <button className="p-3 rounded-2xl hover:bg-white/5 text-white/60 hover:text-accent-cyan transition-all"><Phone className="w-5 h-5" /></button>
                <button className="p-3 rounded-2xl hover:bg-white/5 text-white/60 hover:text-accent-cyan transition-all"><Video className="w-5 h-5" /></button>
                <button className="p-3 rounded-2xl hover:bg-white/5 text-white/60 hover:text-accent-cyan transition-all"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar bg-black/5">
              {loadingMessages ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 border-2 border-accent-cyan/20 border-t-accent-cyan rounded-full animate-spin" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-cyan animate-pulse">Decrypting secure channel...</div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {messages.map((msg, idx) => {
                    const isMe = msg.sender_id === currentUser.id;
                    return (
                      <motion.div 
                        key={msg.id} 
                        initial={{ opacity: 0, x: isMe ? 20 : -20, y: 10 }} 
                        animate={{ opacity: 1, x: 0, y: 0 }} 
                        transition={{ type: 'spring', damping: 20, stiffness: 200, delay: Math.min(idx * 0.05, 0.5) }}
                        className={cn("flex", isMe ? 'justify-end' : 'justify-start')}
                      >
                        <div className={cn("flex flex-col", isMe ? 'items-end' : 'items-start', "max-w-[85%] sm:max-w-[70%]")}>
                          <div className={cn(
                            "group relative px-5 py-3.5 transition-all duration-300",
                            isMe 
                              ? "bg-gradient-to-br from-accent-cyan to-accent-blue text-surface-primary rounded-2xl rounded-tr-none shadow-[0_10px_30px_rgba(0,212,255,0.2)]" 
                              : "glass-dark border border-white/5 text-white/90 rounded-2xl rounded-tl-none hover:border-white/20"
                          )}>
                            {msg.file_url && (
                              <div className="mb-3 rounded-xl overflow-hidden bg-black/20 border border-white/5">
                                {msg.file_type?.startsWith('image/') ? (
                                  <img src={getFileUrl(msg.file_url)} className="max-w-full h-auto max-h-64 object-contain cursor-pointer transition-transform hover:scale-105" onClick={() => window.open(getFileUrl(msg.file_url!), '_blank')} />
                                ) : (
                                  <div className="p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-accent-cyan">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                      <p className="text-xs font-bold truncate">{msg.file_name}</p>
                                      <a href={getFileUrl(msg.file_url)} download className="text-[10px] text-accent-cyan hover:underline uppercase tracking-widest font-bold">Download Asset</a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            <p className="text-[15px] leading-relaxed tracking-tight">{msg.content}</p>
                            
                            {/* Time overlay on hover */}
                            <div className={cn(
                              "absolute bottom-0 opacity-0 group-hover:opacity-100 transition-opacity translate-y-full py-1 font-mono text-[9px] uppercase tracking-widest",
                              isMe ? "right-0 text-white/30" : "left-0 text-white/30"
                            )}>
                              SENT AT {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </div>
                          </div>
                          
                          <div className="mt-2 flex items-center gap-1.5 px-1">
                             <span className="text-[9px] text-white/10 font-mono tracking-tighter">
                               {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                             </span>
                             {isMe && (
                               msg.is_read 
                                ? <CheckCheck className="w-3.5 h-3.5 text-accent-cyan drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]" /> 
                                : <Check className="w-3.5 h-3.5 text-white/10" />
                             )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              {otherUserTyping && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-accent-cyan rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-accent-cyan rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-accent-cyan rounded-full animate-bounce" />
                  </div>
                  <div className="text-[10px] text-accent-cyan font-bold uppercase tracking-[0.2em] animate-pulse">
                    {activeUserProfile.username} is encoding message...
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-4 sm:p-6 glass-dark border-t border-white/5 bg-black/40 relative">
              <AnimatePresence>
                {selectedFile && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-4 overflow-hidden">
                    <div className="p-4 glass-card bg-accent-cyan/5 border-accent-cyan/20 flex items-center justify-between rounded-2xl">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 flex items-center justify-center">
                           <Paperclip className="w-5 h-5 text-accent-cyan" />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-bold truncate text-white/90">{selectedFile.name}</span>
                          <span className="text-[10px] text-white/30 uppercase tracking-widest">Ready for uplink</span>
                        </div>
                      </div>
                      <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-accent-pink transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <form onSubmit={handleSend} className="flex gap-3 items-end max-w-6xl mx-auto">
                <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-4 rounded-2xl hover:bg-white/5 text-white/40 hover:text-accent-cyan transition-all mb-0.5"
                >
                  <Paperclip className="w-6 h-6" />
                </button>
                <div className="flex-1 relative group">
                  <div className="absolute inset-0 bg-accent-cyan/5 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl pointer-events-none" />
                  <input 
                    type="text" 
                    value={newMessage} 
                    onChange={handleTyping} 
                    placeholder="Type your transmission..." 
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
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_5px_rgba(0,212,255,1)]" />
                   <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">Secure End-to-End Encryption</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-accent-purple shadow-[0_0_5px_rgba(168,85,247,1)]" />
                   <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">Real-time Latency: 12ms</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center relative p-8 text-center max-w-md mx-auto">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-accent-cyan/20 blur-3xl rounded-full" />
              <div className="relative w-32 h-32 rounded-3xl bg-surface-elevated border border-white/10 flex items-center justify-center">
                <Cpu className="w-16 h-16 text-accent-cyan animate-pulse" />
              </div>
            </div>
            <h3 className="text-3xl font-bold tracking-tighter uppercase italic mb-4">Signal Hub</h3>
            <p className="text-white/40 text-sm leading-relaxed mb-8">Select an active node from the sidebar to establish a secure, encrypted communication channel.</p>
            <div className="flex flex-wrap justify-center gap-2 opacity-30">
               {['ENCRYPT', 'SYNC', 'NODE_SCAN', 'LINK_ID'].map(tag => (
                 <span key={tag} className="px-3 py-1 border border-white/20 rounded-full text-[9px] font-mono">{tag}</span>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4" 
            onClick={() => setShowProfileModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }} 
              className="bg-surface-secondary/50 border border-white/10 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl relative overflow-hidden glass" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-purple" />
              
              <div className="text-center relative z-10">
                <TiltCard className="inline-block mb-8">
                  <div className="w-32 h-32 mx-auto rounded-[2rem] bg-gradient-to-br from-accent-cyan via-accent-blue to-accent-purple p-1 shadow-2xl shadow-accent-cyan/20">
                    <div className="w-full h-full rounded-[1.8rem] bg-surface-primary flex items-center justify-center font-bold text-5xl">
                      {showProfileModal.username[0].toUpperCase()}
                    </div>
                  </div>
                </TiltCard>
                
                <h2 className="text-3xl font-bold tracking-tighter mb-1 uppercase italic">{showProfileModal.username}</h2>
                <div className="flex items-center justify-center gap-2 mb-8">
                  <div className={cn("w-2 h-2 rounded-full", isOnline(showProfileModal.last_seen) ? "bg-accent-emerald animate-pulse" : "bg-white/10")}></div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-mono">
                    {isOnline(showProfileModal.last_seen) ? 'Link Operational' : 'Offline / Dormant'}
                  </p>
                </div>
                
                {showProfileModal.bio ? (
                  <p className="text-white/60 text-base leading-relaxed mb-10 italic">"{showProfileModal.bio}"</p>
                ) : (
                  <p className="text-white/20 text-sm mb-10 font-mono tracking-widest">[ NO BIO DATA FOUND ]</p>
                )}
                
                <div className="grid grid-cols-2 gap-4 mb-10">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-left">
                    <p className="text-[9px] uppercase tracking-widest text-white/30 mb-1 font-mono">Node ID</p>
                    <p className="text-sm font-mono text-accent-cyan">#TX-{showProfileModal.id.slice(0, 8)}</p>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-left">
                    <p className="text-[9px] uppercase tracking-widest text-white/30 mb-1 font-mono">Status</p>
                    <p className="text-sm font-mono text-white/80">{isOnline(showProfileModal.last_seen) ? 'VERIFIED' : 'UNSTABLE'}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => { setShowProfileModal(null); setActiveUserId(showProfileModal.id); setShowMobileList(false); }} 
                    className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary font-bold flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(0,212,255,0.4)] hover:scale-[1.02] transition-all"
                  >
                    <MessageCircle className="w-5 h-5" />
                    OPEN CHANNEL
                  </button>
                  <button 
                    onClick={() => setShowProfileModal(null)} 
                    className="px-8 py-5 rounded-2xl border border-white/10 hover:bg-white/5 transition-all text-white/60 font-bold tracking-widest text-xs"
                  >
                    DISCONNECT
                  </button>
                </div>
              </div>
              
              {/* Background accent */}
              <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-accent-cyan/10 blur-[100px] rounded-full pointer-events-none" />
              <div className="absolute -top-20 -left-20 w-64 h-64 bg-accent-purple/10 blur-[100px] rounded-full pointer-events-none" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
