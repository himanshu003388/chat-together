import React, { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Send, Paperclip, FileText, Image as ImageIcon, X, Download,
  Smile, MessageCircle, Pin, PinOff, Trash2, Edit3, Check,
  ChevronLeft, Users, Hash, MoreVertical, Heart, ThumbsUp,
  ThumbsDown, Laugh, Angry, UserPlus, Search
} from 'lucide-react';

const supabase = createBrowserClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

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

    if (replyTo) {
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
          return { ...msg, reactions: reactions || [] };
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!confirm('Delete this message?')) return;
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
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 86400000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const renderFileContent = (msg: Message, isMe: boolean) => {
    if (!msg.file_url) return null;
    const isImage = msg.file_type?.startsWith('image/');
    const isPDF = msg.file_type === 'application/pdf';

    if (isImage) {
      return (
        <div className="mt-2">
          <img
            src={msg.file_url}
            alt={msg.file_name || 'image'}
            className="max-w-[250px] rounded-lg cursor-pointer hover:opacity-90 transition shadow-sm border border-white/20"
            onClick={() => window.open(msg.file_url!, '_blank')}
          />
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-2 p-2 bg-white/10 rounded-lg border border-white/20">
        {isPDF ? <FileText className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
        <span className="text-xs font-medium truncate max-w-[150px]">{msg.file_name}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="ml-auto p-1 hover:bg-white/20 rounded transition">
          <Download className="w-4 h-4" />
        </a>
      </div>
    );
  };

  const isOnline = (userId: string) => onlineUsers.includes(userId);

  const displayMessages = filteredMessages || messages;

  const pinnedMessagesList = messages.filter(m =>
    pinnedMessages.some(p => p.message_id === m.id)
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="md:hidden p-1 hover:bg-white/20 rounded">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">General Chat</h2>
              <p className="text-xs text-indigo-200 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                {onlineUsers.length} online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 hover:bg-white/20 rounded-full transition"
              title="Search messages"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowPinned(!showPinned)}
              className={`p-2 rounded-full transition ${showPinned ? 'bg-white/30' : 'hover:bg-white/20'}`}
              title="Pinned messages"
            >
              <Pin className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-white/20 rounded-full transition" title="Members">
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="mt-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => searchMessages(e.target.value)}
              placeholder="Search messages..."
              className="w-full px-4 py-2 rounded-lg bg-white/20 text-white placeholder-indigo-200 border border-white/30 focus:outline-none focus:bg-white/30"
            />
          </div>
        )}
      </div>

      {/* Pinned Messages Bar */}
      {pinnedMessagesList.length > 0 && !showPinned && (
        <div
          onClick={() => setShowPinned(true)}
          className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 cursor-pointer hover:bg-amber-100 transition"
        >
          <Pin className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-800 font-medium">
            {pinnedMessagesList.length} pinned message{pinnedMessagesList.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Pinned Messages Panel */}
      {showPinned && (
        <div className="border-b border-gray-200 bg-gray-50 p-4 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Pin className="w-4 h-4" /> Pinned Messages
            </h3>
            <button onClick={() => setShowPinned(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {pinnedMessagesList.map(msg => (
            <div key={msg.id} className="py-2 border-b border-gray-200 last:border-0">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs text-indigo-600 font-bold">
                  {msg.profiles?.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-gray-600">{msg.profiles?.username}</span>
                  <p className="text-sm text-gray-800 truncate">{msg.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {filteredMessages && filteredMessages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No messages found for "{searchQuery}"</p>
          </div>
        )}

        {displayMessages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id;
          const isPinned = pinnedMessages.some(p => p.message_id === msg.id);

          return (
            <div key={msg.id} className={`group relative ${isPinned ? 'bg-amber-50 -mx-2 px-2 py-2 rounded-lg' : ''}`}>
              {isPinned && (
                <Pin className="absolute top-2 right-2 w-3 h-3 text-amber-500" />
              )}

              {/* Reply Preview */}
              {msg.reply_message && (
                <div className="ml-8 mb-1 pl-3 border-l-2 border-indigo-300 text-xs text-gray-500">
                  <span className="font-semibold text-indigo-600">{msg.reply_message.profiles?.username}</span>
                  <span className="ml-1 truncate">{msg.reply_message.content}</span>
                </div>
              )}

              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <div className="flex-shrink-0 mr-2 self-end mb-1 relative">
                    {msg.profiles?.avatar_url ? (
                      <img src={msg.profiles.avatar_url} className="w-8 h-8 rounded-full border-2 border-white shadow" alt="" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials(msg.profiles?.username || 'U')}
                      </div>
                    )}
                    {isOnline(msg.sender_id) && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></span>
                    )}
                  </div>
                )}

                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">{msg.profiles?.username}</span>
                      <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`relative rounded-2xl px-4 py-2 shadow-sm transition ${
                    isMe
                      ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                  }`}>
                    {editingId === msg.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateMessage()}
                          className={`flex-1 bg-transparent border-none focus:outline-none text-sm ${isMe ? 'text-white' : 'text-gray-900'}`}
                        />
                        <button onClick={updateMessage} className="p-1 hover:bg-white/20 rounded">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancelEdit} className="p-1 hover:bg-white/20 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        {msg.content && <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>}
                        {renderFileContent(msg, isMe)}
                      </>
                    )}

                    {isMe && (
                      <span className="text-[10px] mt-1 block text-indigo-200">
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                        const count = msg.reactions!.filter(r => r.emoji === emoji).length;
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition ${
                              isMe
                                ? 'bg-indigo-800/50 hover:bg-indigo-700/50'
                                : 'bg-white border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className={isMe ? 'text-indigo-200' : 'text-gray-600'}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition ${isMe ? 'flex-row-reverse' : ''}`}>
                    <button
                      onClick={() => setReplyTo(msg)}
                      className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500"
                      title="Reply"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                      className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500"
                      title="Add reaction"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => togglePin(msg.id)}
                      className={`p-1.5 hover:bg-gray-200 rounded-full ${isPinned ? 'text-amber-500' : 'text-gray-500'}`}
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    {isMe && (
                      <>
                        <button
                          onClick={() => startEdit(msg)}
                          className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1.5 hover:bg-red-100 rounded-full text-gray-500 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Emoji Picker */}
                  {showEmojiPicker === msg.id && (
                    <div className={`absolute ${isMe ? 'right-0' : 'left-0'} top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-1 z-10`}>
                      {EMOJI_OPTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => { toggleReaction(msg.id, emoji); setShowEmojiPicker(null); }}
                          className="p-1 hover:bg-gray-100 rounded text-lg transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-600" />
          <span className="text-sm text-indigo-800">
            Replying to <span className="font-semibold">{replyTo.profiles?.username}</span>
          </span>
          <button onClick={() => setReplyTo(null)} className="ml-auto text-indigo-400 hover:text-indigo-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File Preview */}
      {selectedFile && (
        <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100 flex items-center gap-2">
          {selectedFile.type.startsWith('image/') ? (
            <ImageIcon className="w-4 h-4 text-indigo-600" />
          ) : (
            <Paperclip className="w-4 h-4 text-indigo-600" />
          )}
          <span className="text-sm text-indigo-800 truncate flex-1">{selectedFile.name}</span>
          <button
            onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            className="text-indigo-400 hover:text-indigo-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSend} className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition"
            disabled={uploading}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm disabled:opacity-50"
            disabled={uploading || !!editingId}
          />

          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || uploading || !!editingId}
            className={`rounded-full p-3 h-10 w-10 flex items-center justify-center transition shadow-md ${
              (newMessage.trim() || selectedFile) && !uploading && !editingId
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}