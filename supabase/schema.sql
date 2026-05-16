-- Create profiles table
CREATE TABLE public.profiles (
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

-- Create messages table
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Nullable for general chat
  content TEXT, -- Nullable because message might only be a file
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

CREATE POLICY "Authenticated users can insert profiles."
  ON public.profiles FOR INSERT
  WITH CHECK ( auth.role() = 'authenticated' );

CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

CREATE POLICY "Users can update own last_seen."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

-- Messages Policies
CREATE POLICY "Authenticated users can insert messages."
  ON public.messages FOR INSERT
  WITH CHECK ( auth.role() = 'authenticated' );

CREATE POLICY "Anyone can view messages."
  ON public.messages FOR SELECT
  USING ( true );

CREATE POLICY "Users can update their received messages (to mark as read)."
  ON public.messages FOR UPDATE
  USING ( auth.uid() = receiver_id );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Create Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Avatar images are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can upload an avatar."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can update their avatar."
  ON storage.objects FOR UPDATE
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Chat attachments are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'chat-attachments' );

CREATE POLICY "Anyone can upload chat attachments."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'chat-attachments' );

CREATE POLICY "Anyone can update chat attachments."
  ON storage.objects FOR UPDATE
  USING ( bucket_id = 'chat-attachments' );

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

-- Reactions table
CREATE TABLE public.reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(message_id, user_id, emoji)
);

-- Reply references
ALTER TABLE public.messages ADD COLUMN reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Pinned messages table
CREATE TABLE public.pinned_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE UNIQUE NOT NULL,
  pinned_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Chat rooms table for future group chats
CREATE TABLE public.chat_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_private BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.chat_room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(room_id, user_id)
);

-- Reactions Policies
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions are viewable by everyone."
  ON public.reactions FOR SELECT
  USING ( true );

CREATE POLICY "Authenticated users can add reactions."
  ON public.reactions FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can remove their own reactions."
  ON public.reactions FOR DELETE
  USING ( auth.uid() = user_id );

-- Pinned messages Policies
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pinned messages are viewable by everyone."
  ON public.pinned_messages FOR SELECT
  USING ( true );

CREATE POLICY "Users can pin messages."
  ON public.pinned_messages FOR INSERT
  WITH CHECK ( auth.uid() = pinned_by );

CREATE POLICY "Users can unpin messages they pinned."
  ON public.pinned_messages FOR DELETE
  USING ( auth.uid() = pinned_by );

-- Chat rooms Policies
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat rooms are viewable by everyone."
  ON public.chat_rooms FOR SELECT
  USING ( true );

CREATE POLICY "Authenticated users can create chat rooms."
  ON public.chat_rooms FOR INSERT
  WITH CHECK ( auth.uid() = created_by );

CREATE POLICY "Room members can view their rooms."
  ON public.chat_room_members FOR SELECT
  USING ( auth.uid() = user_id );

CREATE POLICY "Users can join rooms."
  ON public.chat_room_members FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

-- Enable Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;