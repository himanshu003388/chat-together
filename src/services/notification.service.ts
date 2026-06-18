import { Resend } from 'resend';
import { logger } from '../utils/logger';

const resend = new Resend(import.meta.env.RESEND_API_KEY || 're_placeholder');

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
}

export class NotificationService {
  private from: string;

  constructor() {
    this.from = import.meta.env.NOTIFICATION_FROM_EMAIL || 'notifications@chattogether.app';
  }

  async sendDirectMessageNotification(params: {
    recipientEmail: string;
    recipientName: string;
    senderUsername: string;
    messageContent: string | null;
    siteUrl: string;
  }): Promise<void> {
    const { recipientEmail, recipientName, senderUsername, messageContent, siteUrl } = params;
    try {
      const payload: EmailPayload = {
        to: [recipientEmail],
        subject: `New message from ${senderUsername} on ChatTogether`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0a0a0f;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #00d4ff, #0066ff); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <span style="color: white; font-weight: 900; font-size: 20px;">C</span>
              </div>
              <h1 style="color: white; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0;">ChatTogether</h1>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; margin-bottom: 24px;">
              <p style="color: rgba(255,255,255,0.5); font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 16px;">Private Message</p>
              <p style="color: #00d4ff; font-size: 18px; font-weight: 700; margin: 0 0 8px;">${senderUsername}</p>
              <p style="color: white; font-size: 15px; line-height: 1.6; margin: 0 0 24px; padding: 16px; background: rgba(0,0,0,0.3); border-radius: 12px; border-left: 3px solid #00d4ff;">${messageContent || 'Sent a file attachment'}</p>
              <a href="${siteUrl}/chat" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00d4ff, #0066ff); color: #0a0a0f; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px;">Reply in Chat</a>
            </div>
            <p style="color: rgba(255,255,255,0.2); font-size: 12px; text-align: center;">You received this because you have an account on ChatTogether</p>
          </div>
        `
      };
      await resend.emails.send({ from: this.from, ...payload });
      logger.info({ recipientEmail, senderUsername }, 'DM notification email sent');
    } catch (err) {
      logger.warn({ err, recipientEmail }, 'Failed to send DM notification email');
    }
  }

  async sendMentionNotification(params: {
    recipientEmail: string;
    recipientName: string;
    mentionedByUsername: string;
    messageContent: string | null;
    siteUrl: string;
    chatType: 'general' | 'room';
    roomName?: string;
  }): Promise<void> {
    const { recipientEmail, recipientName, mentionedByUsername, messageContent, siteUrl, chatType, roomName } = params;
    try {
      const channelLabel = chatType === 'room' ? `#${roomName || 'room'}` : 'General Hall';
      const linkUrl = chatType === 'room' ? `${siteUrl}/chat/rooms` : `${siteUrl}/`;
      const payload: EmailPayload = {
        to: [recipientEmail],
        subject: `${mentionedByUsername} mentioned you in ${channelLabel} on ChatTogether`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0a0a0f;">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #00d4ff, #0066ff); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <span style="color: white; font-weight: 900; font-size: 20px;">C</span>
              </div>
              <h1 style="color: white; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0;">ChatTogether</h1>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; margin-bottom: 24px;">
              <p style="color: rgba(255,255,255,0.5); font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 16px;">Mention in ${channelLabel}</p>
              <p style="color: #00d4ff; font-size: 18px; font-weight: 700; margin: 0 0 4px;">${mentionedByUsername}</p>
              <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 16px;">mentioned <strong style="color: #a78bfa;">@${recipientName}</strong> in a message</p>
              <p style="color: white; font-size: 15px; line-height: 1.6; margin: 0 0 24px; padding: 16px; background: rgba(0,0,0,0.3); border-radius: 12px; border-left: 3px solid #a78bfa;">${messageContent || 'Sent a file attachment'}</p>
              <a href="${linkUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00d4ff, #0066ff); color: #0a0a0f; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px;">View in Chat</a>
            </div>
            <p style="color: rgba(255,255,255,0.2); font-size: 12px; text-align: center;">You received this because you have an account on ChatTogether</p>
          </div>
        `
      };
      await resend.emails.send({ from: this.from, ...payload });
      logger.info({ recipientEmail, mentionedByUsername }, 'Mention notification email sent');
    } catch (err) {
      logger.warn({ err, recipientEmail }, 'Failed to send mention notification email');
    }
  }
}