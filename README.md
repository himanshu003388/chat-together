# Real-Time Chat Application

A production-ready real-time chat web application built with Astro, Tailwind CSS, and Supabase.

## Features

- **Authentication**: Sign up, login, logout with Supabase Auth
- **User Profiles**: View and edit profile with avatar upload
- **Real-Time Chat**: Instant messaging with typing indicators and online status
- **Admin Panel**: Manage users, ban/unban, view statistics

## Tech Stack

- **Frontend**: Astro + React + Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage, Realtime)
- **Adapter**: Node.js (SSR)

## Project Structure

```
src/
├── components/       # React components (ChatApp)
├── layouts/          # Astro layouts
├── lib/              # Supabase client
├── middleware.ts     # Auth middleware
├── pages/            # Astro pages and API routes
│   ├── api/auth/     # Auth API endpoints
│   ├── admin/        # Admin dashboard pages
│   └── chat/         # Chat pages
└── styles/           # Global styles
supabase/
└── schema.sql        # Database schema and RLS policies
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- Supabase account

### 2. Clone and Install

```bash
npm install
```

### 3. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the contents of `supabase/schema.sql`
3. Go to **Settings > API** and copy:
   - Project URL
   - anon public key

### 4. Environment Variables

Create a `.env` file in the project root:

```env
PUBLIC_SUPABASE_URL=your_supabase_project_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 5. Admin Setup

The admin access is controlled by email. To make a user an admin:

1. In `src/pages/api/auth/signup.ts`, find this line:
   ```typescript
   const ADMIN_EMAIL = 'myadmin@email.com';
   ```
2. Replace with your admin email address
3. When that email signs up, they will automatically get admin role

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### 7. Build for Production

```bash
npm run build
```

The built server will be in the `dist/` folder.

## Supabase Database Schema

The schema includes:

- **profiles**: User profiles with role, avatar, last_seen
- **messages**: Chat messages with sender/receiver
- **RLS Policies**: Secure row-level security
- **Storage**: Avatar upload bucket

See `supabase/schema.sql` for complete SQL commands.

## Key Features Details

### Real-Time Chat
- Instant message delivery via Supabase Realtime
- Typing indicators with broadcast channels
- Online/offline status based on last_seen

### Admin Dashboard
- View all users and statistics
- Ban/unban users
- Access restricted to admin role only

### Security
- RLS policies restrict data access
- Middleware protects authenticated routes
- Banned users cannot access the app