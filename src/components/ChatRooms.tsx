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
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <p className="text-sm text-white/40 font-mono mb-2">Discover</p>
          <h1 className="text-4xl font-bold">Communities</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span>Create Room</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin"></div>
          <p className="text-white/40 text-sm">Loading rooms...</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {rooms.map((room, idx) => (
              <motion.article
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card group flex flex-col h-full hover:border-accent-cyan/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 flex items-center justify-center">
                    <Hash className="w-5 h-5 text-accent-cyan" />
                  </div>
                  <div className="text-xs font-mono text-white/40 px-2 py-1 rounded-full bg-white/5">
                    {room.member_count} members
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:text-accent-cyan transition-colors">{room.name}</h3>
                <p className="text-sm text-white/50 mb-6 line-clamp-2 flex-1">
                  {room.description || 'No description provided'}
                </p>
                <a
                  href={`/chat/rooms/${room.id}`}
                  className="w-full btn-secondary text-center flex items-center justify-center gap-2 group/btn"
                >
                  <span className="text-sm">Join Room</span>
                  <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </a>
              </motion.article>
            ))}
          </AnimatePresence>

          {rooms.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center glass-card">
              <Users className="w-12 h-12 text-white/20 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No rooms yet</h3>
              <p className="text-white/40 text-sm mb-6">Be the first to create a community</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                Create Room
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-surface-primary/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="glass-card w-full max-w-md relative z-10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <div>
                  <p className="text-sm text-white/40 font-mono mb-1">Create new</p>
                  <h2 id="modal-title" className="text-2xl font-bold">New Community</h2>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateRoom} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label htmlFor="room-name" className="text-sm font-medium text-white/70">Room Name</label>
                  <input
                    id="room-name"
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Enter room name"
                    className="input-glass"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="room-desc" className="text-sm font-medium text-white/70">Description (optional)</label>
                  <textarea
                    id="room-desc"
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="What's this community about?"
                    rows={3}
                    className="input-glass resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Create
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