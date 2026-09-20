/**
 * Where an invitation points.
 *
 * The production host is hardcoded, matching lib/classes/shareClass.ts and
 * components/QrCodePanel.tsx and for the same reason: these URLs are emailed,
 * pasted into WhatsApp and forwarded for months. They outlive the tab and the
 * deployment that produced them. NEXT_PUBLIC_APP_URL is a preview or localhost
 * host everywhere except production, and using it would bake a dead domain into
 * somebody's inbox.
 */
const PUBLIC_BASE = 'https://myitutor.com';

/** The hop an emailed invitation points at. */
export function inviteUrl(token: string): string {
  return `${PUBLIC_BASE}/invite/${encodeURIComponent(token)}`;
}

/** The same hop, for a class's shared link. One token per class. */
export function classLinkUrl(token: string): string {
  return `${PUBLIC_BASE}/invite/${encodeURIComponent(token)}`;
}

/** Where the hop sends somebody once the cookie is set. */
export function classDestination(groupId: string | null): string {
  return groupId ? `/student/explore/${groupId}` : '/student/explore';
}
