import { z } from 'zod';

const WHATSAPP_RE = /^https:\/\/chat\.whatsapp\.com\//;
const CLASSROOM_RE = /^https:\/\/classroom\.google\.com\/(c|h)\//;

export const classSettingsSchema = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  require_join_requests: z.boolean().optional(),
  auto_suspend_missed_payment: z.boolean().optional(),
  grace_period_days: z.number().int().min(0).max(30).optional(),
  whatsapp_url: z.string().regex(WHATSAPP_RE, 'Must be a valid WhatsApp group link (https://chat.whatsapp.com/…)').or(z.literal('')).or(z.null()).optional(),
  google_classroom_link: z.string().regex(CLASSROOM_RE, 'Must be a valid Google Classroom link (https://classroom.google.com/c/… or /h/…)').or(z.literal('')).or(z.null()).optional(),
  primary_channel: z.enum(['native', 'whatsapp', 'classroom']).optional(),
  parent_feedback_mode: z.enum(['off', 'included_free', 'paid_addon']).optional(),
  parent_feedback_price: z.number().min(0).or(z.null()).optional(),
  meeting_link: z.string().url('Must be a valid URL').or(z.literal('')).or(z.null()).optional(),
  price_monthly: z.number().min(0).or(z.null()).optional(),
  pricing_model: z.enum(['MONTHLY', 'FREE', 'PER_SESSION']).optional(),
  member_service_fee: z.number().min(0).optional(),
});

export type ClassSettingsInput = z.infer<typeof classSettingsSchema>;
