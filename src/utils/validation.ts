import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const resendSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const profileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores allowed'),
  bio: z.string().max(160).optional(),
});

export const messageSchema = z.object({
  content: z.string().min(1).max(1000),
  room_id: z.string().uuid().optional(),
});
