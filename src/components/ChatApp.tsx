import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, User, MoreVertical, Check, CheckCheck, Phone, Video } from 'lucide-react';

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
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [activeUserProfile, setActiveUserProfile] = useState<Profile | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Filter profiles by search
  const filteredProfiles = profiles.filter((p) =>
    p.username.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !p.is_banned
  );

  // Get active user profile
  useEffect(() => {
    if (activeUserId) {
      const profile = profiles.find((p) => p.id === activeUserId);
      setActiveUserProfile(profile || null);
    } else {
      setActiveUserProfile(null);
    }
  }, [activeUserId, profiles]);

  // Real-time channel setup
  useEffect(() => {
    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    if (!activeUserId) return;

    // Create new channel for this conversation
    const channel = supabase
      .channel(`chat-${activeUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Only add if from active user
          if (newMsg.sender_id === activeUserId) {
            setMessages((prev) => [...prev, newMsg]);
            // Mark as read
            await supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', newMsg.id);
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
            prev.map((m) => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserId, currentUser.id]);

  // Typing indicator channel
  useEffect(() => {
    if (!activeUserId) return;

    const typingChannel = supabase
      .channel(`typing-${activeUserId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId === activeUserId) {
          setOtherUserTyping(payload.payload.typing);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
    };
  }, [activeUserId]);

  // Profile updates listener
  useEffect(() => {
    const profileChannel = supabase
      .channel('profiles-updates')
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
      supabase.removeChannel(profileChannel);
    };
  }, []);

  // Update last seen on mount and unmount
  useEffect(() => {
    updateLastSeen();
    const interval = setInterval(updateLastSeen, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateLastSeen = async () => {
    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', currentUser.id);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, last_seen, is_banned')
      .neq('id', currentUser.id)
      .order('last_seen', { ascending: false });
    if (data) setProfiles(data);
  };

  const fetchMessages = useCallback(async () => {
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
      }

      // Mark messages as read
      const unreadMessages = data?.filter(
        (m) => m.receiver_id === currentUser.id && !m.is_read
      );

      if (unreadMessages && unreadMessages.length > 0) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadMessages.map((m) => m.id));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeUserId, currentUser.id]);

  // Fetch messages when active user changes
  useEffect(() => {
    if (activeUserId) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [activeUserId, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherUserTyping]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (!activeUserId) return;

    // Send typing indicator
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
    }, 1500);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeUserId || sendingMessage) return;

    const content = newMessage.trim();
    setSendingMessage(true);

    // Stop typing indicator
    supabase.channel(`typing-${activeUserId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing: false },
    });

    // Optimistic update
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_id: currentUser.id,
      receiver_id: activeUserId,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
    };

    setMessages((prev) => [...prev, tempMsg]);
    setNewMessage('');

    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: currentUser.id,
        receiver_id: activeUserId,
        content,
      });

      if (error) {
        console.error('Error sending message:', error);
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSendingMessage(false);
    }
  };

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex w-full h-full bg-surface-primary overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-surface-secondary border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Messages</h2>
            <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center text-sm font-medium text-accent-cyan">
              {filteredProfiles.length}
            </div>
          </div>
          <div className="relative">
            <label htmlFor="user-search" className="sr-only">Search</label>
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Search className="w-4 h-4 text-white/40" />
            </div>
            <input
              id="user-search"
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass text-sm pl-9 py-2.5"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence>
            {filteredProfiles.length === 0 ? (
              <div className="p-8 text-center">
                <User className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No users found</p>
              </div>
            ) : (
              filteredProfiles.map((profile, idx) => (
                <motion.button
                  key={profile.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setActiveUserId(profile.id)}
                  className={`w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-all border-b border-white/5 ${
                    activeUserId === profile.id ? 'bg-white/10' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center text-lg font-medium">
                      {profile.username[0].toUpperCase()}
                    </div>
                    {isOnline(profile.last_seen) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent-emerald rounded-full border-2 border-surface-secondary"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{profile.username}</div>
                    <div className="text-xs text-white/40">
                      {isOnline(profile.last_seen) ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeUserId && activeUserProfile ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-white/5 glass flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-sm font-medium">
                    {activeUserProfile.username[0].toUpperCase()}
                  </div>
                  {isOnline(activeUserProfile.last_seen) && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-accent-emerald rounded-full border-2 border-surface-primary"></div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{activeUserProfile.username}</h3>
                  <p className="text-xs text-white/40">
                    {isOnline(activeUserProfile.last_seen) ? 'Online' : 'Last seen ' + formatTime(activeUserProfile.last_seen || '')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2.5 rounded-xl hover:bg-white/10 transition-all">
                  <Phone className="w-5 h-5 text-white/60" />
                </button>
                <button className="p-2.5 rounded-xl hover:bg-white/10 transition-all">
                  <Video className="w-5 h-5 text-white/60" />
                </button>
                <button className="p-2.5 rounded-xl hover:bg-white/10 transition-all">
                  <MoreVertical className="w-5 h-5 text-white/60" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite">
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-10 h-10 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin"></div>
                  <span className="text-sm text-white/40">Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center">
                    <User className="w-10 h-10 text-white/30" />
                  </div>
                  <p className="text-white/40 text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((msg, idx) => {
                    const isMe = msg.sender_id === currentUser.id;
                    const showDate = idx === 0 ||
                      new Date(messages[idx - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();

                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center">
                            <span className="text-xs text-white/30 px-3 py-1 rounded-full bg-white/5">
                              {new Date(msg.created_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`rounded-2xl px-4 py-3 ${
                              isMe
                                ? 'bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary'
                                : 'bg-surface-elevated border border-white/10'
                            }`}>
                              <p className="text-sm leading-relaxed">{msg.content}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                              <span className="text-xs text-white/30 font-mono">
                                {formatTime(msg.created_at)}
                              </span>
                              {isMe && (
                                msg.is_read ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-accent-cyan" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-white/30" />
                                )
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {otherUserTyping && (
              <div className="px-4 py-2">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-white/40 text-sm"
                >
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span>{activeUserProfile.username} is typing...</span>
                </motion.div>
              </div>
            )}

            {/* Message Input */}
            <div className="p-4 border-t border-white/5">
              <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label htmlFor="message-input" className="sr-only">Message</label>
                  <input
                    id="message-input"
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder="Type a message..."
                    className="input-glass"
                    disabled={sendingMessage}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  className="p-3 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary font-medium hover:shadow-glow-cyan transition-all disabled:opacity-50"
                >
                  {sendingMessage ? (
                    <div className="w-5 h-5 border-2 border-surface-primary/30 border-t-surface-primary rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* No user selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center">
              <User className="w-12 h-12 text-white/30" />
            </div>
            <h3 className="text-xl font-semibold">Select a conversation</h3>
            <p className="text-white/40 text-sm">Choose a user from the sidebar to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}