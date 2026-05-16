import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Paperclip, 
  Smile, 
  MoreVertical, 
  Hash, 
  Users, 
  ChevronLeft,
  Search,
  Pin,
  Heart,
  ThumbsUp,
  MessageSquare,
  X
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
    <div className="flex flex-col h-full bg-white elite-border overflow-hidden">
      {/* Header */}
      <div className="p-8 border-b border-elite-black bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/chat/rooms" aria-label="Back" className="p-3 elite-border hover:bg-elite-black hover:text-white transition-all">
              <ChevronLeft className="w-6 h-6" />
            </a>
            <div className="w-14 h-14 elite-border flex items-center justify-center bg-elite-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
              <Hash className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-black text-2xl uppercase tracking-tightest">{roomName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <p className="text-[10px] font-mono font-bold text-elite-neutral-400 uppercase tracking-[0.2em]">NETWORK NODE ACTIVE</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Settings" className="p-3 elite-border hover:bg-elite-neutral-50 transition-all">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-white selection:bg-elite-black selection:text-white" role="log" aria-live="polite">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-20">
            <div className="w-12 h-1 bg-elite-black animate-pulse"></div>
            <span className="text-[8px] font-black uppercase tracking-widest">Decoding Stream...</span>
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
                  transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    {!isMe && (
                      <div className="flex items-center gap-3 mb-3 ml-1">
                        <div className="w-6 h-6 elite-border flex items-center justify-center bg-elite-black text-white text-[8px] font-black">
                          {msg.profiles?.username?.[0].toUpperCase()}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest">{msg.profiles?.username}</span>
                      </div>
                    )}
                    
                    <div className={`relative elite-border px-6 py-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${
                      isMe ? 'bg-elite-black text-white' : 'bg-white text-elite-black'
                    }`}>
                      <p className="text-sm font-bold leading-relaxed tracking-tight uppercase">{msg.content}</p>
                    </div>

                    <div className="mt-3">
                      <span className="text-[8px] font-mono font-bold text-elite-neutral-400 uppercase">
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
      <div className="p-8 bg-white border-t border-elite-black">
        <form onSubmit={handleSend} className="flex gap-6 items-end">
          <div className="flex-1 relative group">
            <label htmlFor="room-message-input" className="sr-only">Input Signal</label>
            <input
              id="room-message-input"
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`MESSAGE #${roomName.toUpperCase()}...`}
              className="w-full bg-white elite-border px-8 py-5 focus:ring-12 focus:ring-elite-black/5 transition-all outline-none font-black text-xs uppercase tracking-tighter"
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label="Execute"
            className="elite-button bg-elite-black text-white !h-[60px] !w-20 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-1 hover:-translate-y-1"
          >
            <Send className="w-6 h-6 mx-auto" />
          </button>
        </form>
      </div>
    </div>
  );
}

