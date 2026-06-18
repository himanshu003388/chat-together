import type { APIRoute } from "astro";
import { NotificationService } from "../../../services/notification.service";
import { logger } from "../../../utils/logger";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { recipientIds, mentionedByUsername, messageContent, chatType, roomName } = body;

    if (!recipientIds?.length || !mentionedByUsername) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const { data: profiles } = await locals.supabase
      .from('profiles')
      .select('email, username')
      .in('id', recipientIds);

    if (!profiles?.length) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const siteUrl = import.meta.env.SITE_URL || 'https://chat-together-neon.vercel.app';
    const notificationService = new NotificationService();

    await Promise.allSettled(
      profiles.map(profile => {
        if (!profile.email) return Promise.resolve();
        return notificationService.sendMentionNotification({
          recipientEmail: profile.email,
          recipientName: profile.username,
          mentionedByUsername,
          messageContent: messageContent || null,
          siteUrl,
          chatType: chatType || 'general',
          roomName,
        });
      })
    );

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    logger.error(err, 'Mention notification API error');
    return new Response(JSON.stringify({ error: 'Failed to send notification' }), { status: 500 });
  }
};