-- ==========================================
-- Fix: Add missing file_name column to messages (safe for existing DB)
-- ==========================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name TEXT;

-- ==========================================
-- 1. TABLES (Use IF NOT EXISTS for existing databases)
-- ==========================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_banned BOOLEAN DEFAULT false NOT NULL,
  role TEXT DEFAULT 'user'::text NOT NULL
);

-- Chat rooms table
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_private BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Chat room members table
CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(room_id, user_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Reactions table
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(message_id, user_id, emoji)
);

-- Pinned messages table
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE UNIQUE NOT NULL,
  pinned_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 2. RLS POLICIES (Use OR REPLACE)
-- ==========================================

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Authenticated users can insert profiles." ON public.profiles;
CREATE POLICY "Authenticated users can insert profiles." ON public.profiles FOR INSERT WITH CHECK ( auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own last_seen." ON public.profiles;
CREATE POLICY "Users can update own last_seen." ON public.profiles FOR UPDATE USING ( auth.uid() = id ) WITH CHECK ( auth.uid() = id );

-- Messages Policies
DROP POLICY IF EXISTS "Anyone can view messages." ON public.messages;
CREATE POLICY "Anyone can view messages." ON public.messages FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Authenticated users can insert messages." ON public.messages;
CREATE POLICY "Authenticated users can insert messages." ON public.messages FOR INSERT WITH CHECK ( auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Users can update their own messages." ON public.messages;
CREATE POLICY "Users can update their own messages." ON public.messages FOR UPDATE USING ( auth.uid() = sender_id );

DROP POLICY IF EXISTS "Users can delete their own messages." ON public.messages;
CREATE POLICY "Users can delete their own messages." ON public.messages FOR DELETE USING ( auth.uid() = sender_id );

DROP POLICY IF EXISTS "Users can update received messages to mark as read." ON public.messages;
CREATE POLICY "Users can update received messages to mark as read." ON public.messages FOR UPDATE USING ( auth.uid() = receiver_id );

-- Reactions Policies
DROP POLICY IF EXISTS "Reactions are viewable by everyone." ON public.reactions;
CREATE POLICY "Reactions are viewable by everyone." ON public.reactions FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Authenticated users can add reactions." ON public.reactions;
CREATE POLICY "Authenticated users can add reactions." ON public.reactions FOR INSERT WITH CHECK ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Users can remove their own reactions." ON public.reactions;
CREATE POLICY "Users can remove their own reactions." ON public.reactions FOR DELETE USING ( auth.uid() = user_id );

-- Pinned messages Policies
DROP POLICY IF EXISTS "Pinned messages are viewable by everyone." ON public.pinned_messages;
CREATE POLICY "Pinned messages are viewable by everyone." ON public.pinned_messages FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Users can pin messages." ON public.pinned_messages;
CREATE POLICY "Users can pin messages." ON public.pinned_messages FOR INSERT WITH CHECK ( auth.uid() = pinned_by );

DROP POLICY IF EXISTS "Users can unpin messages they pinned." ON public.pinned_messages;
CREATE POLICY "Users can unpin messages they pinned." ON public.pinned_messages FOR DELETE USING ( auth.uid() = pinned_by );

-- Chat rooms Policies
DROP POLICY IF EXISTS "Chat rooms are viewable by everyone." ON public.chat_rooms;
CREATE POLICY "Chat rooms are viewable by everyone." ON public.chat_rooms FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Authenticated users can create chat rooms." ON public.chat_rooms;
CREATE POLICY "Authenticated users can create chat rooms." ON public.chat_rooms FOR INSERT WITH CHECK ( auth.uid() = created_by );

-- Chat room members Policies
DROP POLICY IF EXISTS "Room members can view their rooms." ON public.chat_room_members;
CREATE POLICY "Room members can view their rooms." ON public.chat_room_members FOR SELECT USING ( auth.uid() = user_id );

DROP POLICY IF EXISTS "Users can join rooms." ON public.chat_room_members;
CREATE POLICY "Users can join rooms." ON public.chat_room_members FOR INSERT WITH CHECK ( auth.uid() = user_id );

-- ==========================================
-- 3. TRIGGERS AND FUNCTIONS
-- ==========================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_email TEXT := 'himanshu003388@gmail.com';
BEGIN
  INSERT INTO public.profiles (id, username, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE WHEN NEW.email = admin_email THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$;

-- Trigger to create a profile automatically after signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update last_seen
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$;

-- Trigger to update last_seen on profile update
DROP TRIGGER IF EXISTS update_last_seen_trigger ON public.profiles;
CREATE TRIGGER update_last_seen_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_seen();

-- ==========================================
-- 4. STORAGE BUCKETS
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;

-- Avatar Policies
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible." ON storage.objects FOR SELECT USING ( bucket_id = 'avatars' );

DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
CREATE POLICY "Anyone can upload an avatar." ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'avatars' );

DROP POLICY IF EXISTS "Anyone can update their avatar." ON storage.objects;
CREATE POLICY "Anyone can update their avatar." ON storage.objects FOR UPDATE USING ( bucket_id = 'avatars' );

-- Chat Attachment Policies
DROP POLICY IF EXISTS "Chat attachments are publicly accessible." ON storage.objects;
CREATE POLICY "Chat attachments are publicly accessible." ON storage.objects FOR SELECT USING ( bucket_id = 'chat-attachments' );

DROP POLICY IF EXISTS "Anyone can upload chat attachments." ON storage.objects;
CREATE POLICY "Anyone can upload chat attachments." ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'chat-attachments' );

DROP POLICY IF EXISTS "Anyone can update chat attachments." ON storage.objects;
CREATE POLICY "Anyone can update chat attachments." ON storage.objects FOR UPDATE USING ( bucket_id = 'chat-attachments' );

-- ==========================================
-- 5. REALTIME (Skip if already added - no error on duplicate)
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pinned_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
  END IF;
END $$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';