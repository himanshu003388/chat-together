import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseBrowser';
import { Users, Plus, Hash, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Room {
  id: string;
  name: string;
  description: string;
  created_by: string;
  is_private: boolean;
  created_at: string;
  member_count?: number;
}

interface ChatRoomsProps {
  currentUser: {
    id: string;
    username?: string;
  };
}

export default function ChatRooms({ currentUser }: ChatRoomsProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('*, members:chat_room_members(count)');
    
    if (data) {
      const roomsWithCount = data.map(room => ({
        ...room,
        member_count: room.members[0].count
      }));
      setRooms(roomsWithCount);
    }
    setLoading(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        name: newRoomName,
        description: newRoomDesc,
        created_by: currentUser.id
      })
      .select()
      .single();

    if (data) {
      await supabase.from('chat_room_members').insert({
        room_id: data.id,
        user_id: currentUser.id
      });
      
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
      fetchRooms();
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto p-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-16 border-b-3 border-elite-black pb-12">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-elite-neutral-400 mb-2 block">Available Networks</span>
          <h1 className="text-6xl font-black text-elite-black tracking-tightest uppercase leading-none">Communities</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="elite-button bg-elite-black text-white flex items-center gap-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-1 hover:-translate-y-1"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs">Establish New Room</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="w-16 h-1 bg-elite-black animate-pulse"></div>
          <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Scanning Frequencies...</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {rooms.map((room, idx) => (
              <motion.article 
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="elite-card group flex flex-col h-full"
              >
                <div className="flex items-start justify-between mb-8">
                  <div className="w-14 h-14 elite-border flex items-center justify-center bg-elite-neutral-50 group-hover:bg-elite-black group-hover:text-white transition-all duration-300">
                    <Hash className="w-7 h-7" />
                  </div>
                  <div className="text-[10px] font-mono font-bold uppercase border-b border-elite-black pb-1">
                    {room.member_count} PARTICIPANTS
                  </div>
                </div>
                <h3 className="text-2xl font-black text-elite-black mb-3 uppercase tracking-tighter group-hover:line-through">{room.name}</h3>
                <p className="text-xs font-medium text-elite-neutral-500 mb-10 line-clamp-3 leading-relaxed flex-1 italic">
                  "{room.description || 'No data transmission provided.'}"
                </p>
                <a
                  href={`/chat/rooms/${room.id}`}
                  className="w-full elite-button bg-white text-elite-black group-hover:bg-elite-black group-hover:text-white text-center flex items-center justify-center gap-2 group/btn"
                >
                  <span className="text-xs">INITIATE CONNECTION</span>
                  <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </a>
              </motion.article>
            ))}
          </AnimatePresence>
          
          {rooms.length === 0 && (
            <div className="col-span-full border-3 border-dashed border-elite-neutral-200 py-32 flex flex-col items-center justify-center text-center">
              <Users className="w-16 h-16 text-elite-neutral-200 mb-6" />
              <h3 className="text-xl font-black uppercase tracking-tighter text-elite-neutral-300 mb-2">Zero Signals Detected</h3>
              <p className="text-[10px] font-bold text-elite-neutral-400 uppercase tracking-widest">The grid is currently silent.</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-elite-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="bg-white w-full max-w-xl elite-border relative shadow-[20px_20px_0px_0px_rgba(0,0,0,0.3)]"
            >
              <div className="p-10 border-b border-elite-black flex justify-between items-center bg-elite-neutral-50">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-[0.4em] text-elite-neutral-400 block mb-1">System Command</span>
                  <h2 id="modal-title" className="text-3xl font-black text-elite-black uppercase tracking-tightest">Establish Channel</h2>
                </div>
                <button 
                  onClick={() => setShowCreateModal(false)} 
                  className="p-3 border-2 border-elite-black hover:bg-elite-black hover:text-white transition-all"
                  aria-label="Terminate"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleCreateRoom} className="p-10 space-y-10">
                <div className="space-y-4">
                  <label htmlFor="room-name" className="text-[10px] font-black uppercase tracking-widest text-elite-neutral-500 flex justify-between">
                    <span>Channel Identity</span>
                    <span className="text-elite-black">REQUIRED</span>
                  </label>
                  <input
                    id="room-name"
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="ENTER CHANNEL NAME..."
                    className="w-full px-6 py-5 elite-border bg-elite-neutral-50 focus:bg-white focus:ring-12 focus:ring-elite-black/5 transition-all outline-none font-bold uppercase tracking-tighter"
                  />
                </div>
                <div className="space-y-4">
                  <label htmlFor="room-desc" className="text-[10px] font-black uppercase tracking-widest text-elite-neutral-500">Channel Transmission Protocol (Optional)</label>
                  <textarea
                    id="room-desc"
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="DESCRIBE CHANNEL PURPOSE..."
                    rows={4}
                    className="w-full px-6 py-5 elite-border bg-elite-neutral-50 focus:bg-white focus:ring-12 focus:ring-elite-black/5 transition-all outline-none font-medium text-sm italic"
                  />
                </div>
                <div className="flex gap-6 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 elite-button bg-white text-elite-black hover:line-through"
                  >
                    ABORT
                  </button>
                  <button
                    type="submit"
                    className="flex-1 elite-button bg-elite-black text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-1 hover:-translate-y-1 transition-all"
                  >
                    EXECUTE COMMAND
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

