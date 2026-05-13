import React, { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Send, Paperclip, FileText, Image as ImageIcon, X, Download, AlertCircle, CheckCircle2 } from 'lucide-react';

// Create a stable supabase client
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
  created_at: string;
  profiles?: Profile;
}

interface GeneralChatProps {
  currentUser: { id: string; email: string; username?: string };
}

export default function GeneralChat({ currentUser }: GeneralChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Diagnostic: Check connection and user on mount
  useEffect(() => {
    console.log('GeneralChat: Initializing with user:', currentUser);
    
    const checkConnection = async () => {
      try {
        // Try to fetch one message to verify schema and connection
        const { error } = await supabase.from('messages').select('id').limit(1);
        if (error) {
          console.error('GeneralChat: Database connection error:', error);
          setDbStatus('error');
          setErrorMessage(`Database Error: ${error.message}. Please ensure you've run the SQL migration.`);
        } else {
          setDbStatus('connected');
        }
      } catch (err) {
        console.error('GeneralChat: Unexpected connection error:', err);
        setDbStatus('error');
      }
    };

    checkConnection();
    fetchMessages();
    
    const channel = supabase
      .channel('general-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.receiver_id !== null) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();
          
          if (profile) {
            newMsg.profiles = profile;
          }
          
          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles:sender_id(id, username, avatar_url)')
        .is('receiver_id', null)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (data) {
        setMessages((data as unknown as Message[]).reverse());
      }
    } catch (err) {
      console.error('GeneralChat: Error in fetchMessages:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMessage(null);
    }
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string } | null> => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

      return {
        url: data.publicUrl,
        name: file.name,
        type: file.type
      };
    } catch (error: any) {
      console.error('GeneralChat: Upload error:', error);
      setErrorMessage(`Upload failed: ${error.message || 'Unknown error'}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    
    if (!currentUser.id) {
        setErrorMessage("You must be logged in to send messages.");
        return;
    }

    const hasContent = newMessage.trim().length > 0;
    const hasFile = selectedFile !== null;
    
    if (!hasContent && !hasFile) return;

    let fileData = null;
    if (hasFile && selectedFile) {
      fileData = await uploadFile(selectedFile);
      if (!fileData && !hasContent) return;
    }

    const contentToSend = newMessage.trim();
    const currentFile = fileData;
    
    setNewMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const messageData = {
      sender_id: currentUser.id,
      receiver_id: null,
      content: contentToSend || null,
      file_url: currentFile?.url || null,
      file_name: currentFile?.name || null,
      file_type: currentFile?.type || null,
    };

    console.log('GeneralChat: Attempting to insert message:', messageData);

    const { error } = await supabase.from('messages').insert(messageData);

    if (error) {
      console.error('GeneralChat: Insert error:', error);
      setErrorMessage(`Failed to send: ${error.message}. TIP: Make sure your 'messages' table has 'receiver_id' as NULLABLE and contains the new file columns.`);
      
      // Restore the message so user doesn't lose it
      setNewMessage(contentToSend);
    }
  };

  const getInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const renderFileContent = (msg: Message) => {
    if (!msg.file_url) return null;
    const isImage = msg.file_type?.startsWith('image/');
    const isPDF = msg.file_type === 'application/pdf';

    if (isImage) {
      return (
        <div className="mt-2">
          <img 
            src={msg.file_url} 
            alt={msg.file_name || 'image'} 
            className="max-w-full rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition shadow-sm"
            onClick={() => window.open(msg.file_url!, '_blank')}
          />
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
        {isPDF ? <FileText className="w-5 h-5 text-red-500" /> : <Paperclip className="w-5 h-5 text-gray-500" />}
        <span className="text-xs font-medium truncate max-w-[150px] text-gray-700">{msg.file_name}</span>
        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="ml-auto p-1 hover:bg-gray-200 rounded transition">
          <Download className="w-4 h-4 text-gray-600" />
        </a>
      </div>
    );
  };

  const canSend = (newMessage.trim().length > 0 || selectedFile !== null) && !uploading;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-indigo-600 text-white flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">General Chat</h2>
          <div className="flex items-center gap-2">
            {dbStatus === 'connected' ? (
                <span className="flex items-center gap-1 text-[10px] text-indigo-100 uppercase tracking-wider font-bold">
                    <CheckCircle2 className="w-3 h-3 text-green-400" /> Connected
                </span>
            ) : dbStatus === 'checking' ? (
                <span className="text-[10px] text-indigo-100 uppercase tracking-wider">Connecting...</span>
            ) : (
                <span className="flex items-center gap-1 text-[10px] text-red-300 uppercase tracking-wider font-bold">
                    <AlertCircle className="w-3 h-3" /> Connection Error
                </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id;
          const senderName = msg.profiles?.username || 'Unknown User';
          
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <div className="flex-shrink-0 mr-2 self-end mb-1">
                  {msg.profiles?.avatar_url ? (
                    <img src={msg.profiles.avatar_url} className="w-8 h-8 rounded-full border border-gray-200" alt={senderName} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">
                      {getInitials(senderName)}
                    </div>
                  )}
                </div>
              )}
              <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <span className="text-[10px] font-semibold text-gray-500 ml-1 mb-1">{senderName}</span>}
                <div className={`rounded-2xl px-4 py-2 shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-none'}`}>
                  {msg.content && <p className="text-sm break-words">{msg.content}</p>}
                  {renderFileContent(msg)}
                  <span className={`text-[10px] mt-1 block ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {errorMessage && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-3 h-3" />
            </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        {selectedFile && (
          <div className="mb-2 p-2 bg-indigo-50 rounded-lg flex items-center gap-2 border border-indigo-100">
            {selectedFile.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-indigo-600" /> : <Paperclip className="w-4 h-4 text-indigo-600" />}
            <span className="text-xs font-medium text-indigo-800 truncate flex-1">{selectedFile.name}</span>
            <button onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="p-1 hover:bg-indigo-100 rounded text-indigo-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" id="file-upload" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition" disabled={uploading}>
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm disabled:opacity-50"
            disabled={uploading || dbStatus === 'error'}
          />
          
          <button
            type="submit"
            disabled={!canSend || dbStatus === 'error'}
            className={`rounded-full p-2 h-10 w-10 flex items-center justify-center transition shadow-md ${canSend && dbStatus !== 'error' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className={`w-5 h-5 ${canSend ? 'ml-0.5' : ''}`} />}
          </button>
        </form>
      </div>
    </div>
  );
}
