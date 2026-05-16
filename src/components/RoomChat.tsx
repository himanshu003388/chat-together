import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  MoreVertical,
  Hash,
  ChevronLeft,
} from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string | null;
  created_at: string;
  file_url?: string;
  file_name?: string;
  reply_to?: string;
  profiles?: Profile;
  reply_message?: Message;
  reactions?: any[];
}

interface RoomChatProps {
  roomId: string;
  roomName: string;
  currentUser: {
    id: string;
    username?: string;
  };
}

export default function RoomChat({ roomId, roomName, currentUser }: RoomChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${roomId}`
      }, async (payload) => {
        const newMsg = payload.new as Message;
        await attachProfile(newMsg);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  const attachProfile = async (msg: Message) => {
    const { data: profile } = await supabase
      .from('profiles').select('id, username, avatar_url')
      .eq('id', msg.sender_id).single();

    msg.profiles = profile || undefined;

    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const fetchMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(id, username, avatar_url)')
      .eq('chat_id', roomId)
      .order('created_at', { ascending: true });

    if (data) setMessages(data as unknown as Message[]);
    setLoading(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const content = newMessage;
    setNewMessage('');

    await supabase.from('messages').insert({
      content,
      sender_id: currentUser.id,
      chat_id: roomId
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface-primary overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/chat/rooms" aria-label="Back" className="p-2 rounded-lg hover:bg-white/10 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </a>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{roomName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 bg-accent-emerald rounded-full animate-pulse"></span>
                <p className="text-xs text-white/40 font-mono">Active</p>
              </div>
            </div>
          </div>
          <button aria-label="Settings" className="p-2.5 rounded-lg hover:bg-white/10 transition-all">
            <MoreVertical className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin"></div>
            <span className="text-sm text-white/40">Loading messages...</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === currentUser.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-xs font-medium">
                          {msg.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-white/70">{msg.profiles?.username}</span>
                      </div>
                    )}

                    <div className={`relative rounded-2xl px-4 py-3 transition-all ${
                      isMe ? 'bg-gradient-to-r from-accent-cyan to-accent-blue text-surface-primary' : 'bg-surface-elevated border border-white/10'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>

                    <div className="mt-2">
                      <span className="text-xs text-white/40 font-mono">
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

      {/* Input Area */}
      <div className="p-4 border-t border-white/5">
        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <label htmlFor="room-message-input" className="sr-only">Message</label>
            <input
              id="room-message-input"
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message #${roomName}`}
              className="input-glass"
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label="Send"
            className="p-3 rounded-xl bg-gradient-to-r from-accent-purple to-accent-pink text-white font-medium hover:shadow-glow-purple transition-all disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}