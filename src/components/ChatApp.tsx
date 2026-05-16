import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, User, Hash, MoreVertical, Check, CheckCheck } from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  last_seen: string | null;
  is_banned: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_read?: boolean;
}

interface ChatAppProps {
  currentUser: { id: string; email: string };
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
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [activeUserProfile, setActiveUserProfile] = useState<Profile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter profiles by search
  const filteredProfiles = profiles.filter((p) =>
    p.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get active user profile
  useEffect(() => {
    if (activeUserId) {
      const profile = profiles.find((p) => p.id === activeUserId);
      setActiveUserProfile(profile || null);
    }
  }, [activeUserId, profiles]);

  // Fetch messages when active user changes
  useEffect(() => {
    if (activeUserId) {
      fetchMessages();
    }
  }, [activeUserId]);

  // Subscribe to realtime messages
  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          if (
            (newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeUserId) ||
            (newMsg.sender_id === activeUserId && newMsg.receiver_id === currentUser.id)
          ) {
            setMessages((prev) => [...prev, newMsg]);
            
            // If we are the receiver and chat is active, mark as read
            if (newMsg.receiver_id === currentUser.id) {
              await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', newMsg.id);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((prev) => 
            prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserId, currentUser.id]);

  // Subscribe to typing status
  useEffect(() => {
    if (!activeUserId) return;

    const channel = supabase
      .channel(`typing-${activeUserId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId === activeUserId) {
          setOtherUserTyping(payload.payload.typing);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserId]);

  // Subscribe to profile updates
  useEffect(() => {
    const channel = supabase
      .channel('profiles-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchProfiles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, last_seen, is_banned')
      .neq('id', currentUser.id)
      .order('last_seen', { ascending: false });
    if (data) setProfiles(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeUserId}),and(sender_id.eq.${activeUserId},receiver_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true });
    
    if (data) {
      setMessages(data);
      
      // Mark messages as read
      const unreadIds = data
        .filter(m => m.receiver_id === currentUser.id && !m.is_read)
        .map(m => m.id);
        
      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadIds);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, otherUserTyping]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    // Broadcast typing status
    supabase.channel(`typing-${activeUserId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing: true },
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      supabase.channel(`typing-${activeUserId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, typing: false },
      });
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeUserId) return;

    const content = newMessage;
    setNewMessage('');

    // Stop typing
    supabase.channel(`typing-${activeUserId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing: false },
    });

    // Optimistic update
    const tempMsg: Message = {
      id: crypto.randomUUID(),
      sender_id: currentUser.id,
      receiver_id: activeUserId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUser.id,
      receiver_id: activeUserId,
      content,
    });

    if (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    }
  };

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div className="flex w-full h-full bg-white elite-border m-6 overflow-hidden">
      {/* Sidebar */}
      <div className="w-96 bg-white border-r border-elite-black flex flex-col">
        <div className="p-8 border-b border-elite-black">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black tracking-tightest uppercase">Inbox</h2>
            <div className="w-8 h-8 elite-border flex items-center justify-center font-bold text-xs bg-elite-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
              {filteredProfiles.length}
            </div>
          </div>
          <div className="relative">
            <label htmlFor="user-search" className="sr-only">Search</label>
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Search className="w-4 h-4 text-elite-neutral-400" />
            </div>
            <input
              id="user-search"
              type="text"
              placeholder="SEARCH USERS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-elite-neutral-50 elite-border pl-10 pr-4 py-3 text-[10px] font-black uppercase tracking-widest focus:bg-white focus:ring-4 focus:ring-elite-black/5 transition-all outline-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-elite-neutral-100">
          <AnimatePresence initial={false}>
            {filteredProfiles.map((profile, idx) => (
              <motion.button
                key={profile.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setActiveUserId(profile.id)}
                aria-selected={activeUserId === profile.id}
                role="tab"
                className={`w-full p-6 flex items-center gap-4 transition-all group relative overflow-hidden ${
                  activeUserId === profile.id ? 'bg-elite-black text-white' : 'hover:bg-elite-neutral-50'
                }`}
              >
                {activeUserId === profile.id && (
                  <motion.div layoutId="sidebar-active" className="absolute inset-0 bg-elite-black -z-10" />
                )}
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className={`w-12 h-12 elite-border object-cover ${activeUserId === profile.id ? 'border-white' : 'border-elite-black'}`}
                    />
                  ) : (
                    <div className={`w-12 h-12 elite-border flex items-center justify-center font-black text-sm ${activeUserId === profile.id ? 'bg-white text-elite-black border-white' : 'bg-elite-black text-white border-elite-black'}`}>
                      {profile.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {isOnline(profile.last_seen) && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 elite-border border-2 border-white rounded-full shadow-sm"></span>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className="font-black text-sm uppercase tracking-tighter truncate">{profile.username}</p>
                    <span className={`text-[8px] font-mono font-bold ${activeUserId === profile.id ? 'text-elite-neutral-400' : 'text-elite-neutral-500'}`}>
                      {isOnline(profile.last_seen) ? 'LIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <p className={`text-[10px] font-medium truncate ${activeUserId === profile.id ? 'text-elite-neutral-400' : 'text-elite-neutral-500'}`}>
                    Click to open secure channel
                  </p>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
          {filteredProfiles.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-elite-neutral-400">No signals found</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {activeUserId && activeUserProfile ? (
          <>
            {/* Chat Header */}
            <div className="h-20 border-b border-elite-black px-8 flex items-center justify-between bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 elite-border flex items-center justify-center font-black bg-elite-neutral-50">
                  {activeUserProfile.username.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-tighter">{activeUserProfile.username}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline(activeUserProfile.last_seen) ? 'bg-green-500' : 'bg-elite-neutral-300'}`}></span>
                    <span className="text-[9px] font-mono font-bold text-elite-neutral-500 uppercase">
                      {isOnline(activeUserProfile.last_seen) ? 'Connection Established' : 'Offline Mode'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-elite-neutral-100 elite-border transition-colors">
                  <Search className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-elite-neutral-100 elite-border transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white selection:bg-elite-black selection:text-white" role="log" aria-live="polite">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, idx) => {
                  const isMe = msg.sender_id === currentUser.id;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[65%]`}>
                        <div
                          className={`elite-border px-5 py-3.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                            isMe
                              ? 'bg-elite-black text-white border-elite-black'
                              : 'bg-white text-elite-black border-elite-black'
                          }`}
                        >
                          <p className="text-sm font-medium leading-relaxed tracking-tight">{msg.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-[9px] font-mono font-bold text-elite-neutral-400 uppercase tracking-tighter">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                          {isMe && (
                            <span className="flex items-center">
                              {msg.is_read ? (
                                <CheckCheck className="w-3 h-3 text-elite-black" strokeWidth={3} />
                              ) : (
                                <Check className="w-3 h-3 text-elite-neutral-300" strokeWidth={3} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {otherUserTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-elite-neutral-50 elite-border px-4 py-2 flex gap-3 items-center">
                    <div className="flex gap-1">
                      <span className="w-1 h-1 bg-elite-black rounded-full animate-bounce"></span>
                      <span className="w-1 h-1 bg-elite-black rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1 h-1 bg-elite-black rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-elite-neutral-500">Signal Incoming...</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-8 bg-white border-t border-elite-black">
              <form onSubmit={handleSendMessage} className="flex gap-4 items-end">
                <div className="flex-1 relative group">
                  <label htmlFor="message-input" className="sr-only">Input Signal</label>
                  <input
                    id="message-input"
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder="TYPE SIGNAL..."
                    className="w-full bg-elite-neutral-50 elite-border px-6 py-4 focus:bg-white focus:ring-8 focus:ring-elite-black/5 transition-all outline-none text-sm font-bold tracking-tight uppercase"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                    <span className="text-[8px] font-mono font-bold text-elite-neutral-400 uppercase tracking-widest">Secure Channel</span>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  aria-label="Send signal"
                  className="elite-button !h-14 !w-14 !p-0 flex items-center justify-center disabled:opacity-20 disabled:grayscale transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-elite-neutral-50/20 p-12">
            <div className="w-24 h-24 elite-border flex items-center justify-center mb-8 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <Hash className="w-12 h-12 text-elite-black" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tightest mb-2">Secure Terminal</h2>
            <p className="text-[10px] font-bold text-elite-neutral-400 uppercase tracking-[0.2em] animate-pulse text-center max-w-xs">
              Waiting for connection. Select a profile to establish an encrypted signal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}