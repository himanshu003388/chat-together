import type { APIRoute } from "astro";
import { NotificationService } from "../../../services/notification.service";
import { logger } from "../../../utils/logger";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { recipientId, senderUsername, messageContent } = body;

    if (!recipientId || !senderUsername) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const { data: profile } = await locals.supabase
      .from('profiles')
      .select('email, username')
      .eq('id', recipientId)
      .maybeSingle();

    if (!profile?.email) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const siteUrl = import.meta.env.SITE_URL || 'https://chat-together-neon.vercel.app';
    const notificationService = new NotificationService();
    await notificationService.sendDirectMessageNotification({
      recipientEmail: profile.email,
      recipientName: profile.username,
      senderUsername,
      messageContent: messageContent || null,
      siteUrl,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    logger.error(err, 'DM notification API error');
    return new Response(JSON.stringify({ error: 'Failed to send notification' }), { status: 500 });
  }
};