/**
 * HTML escaping for email bodies.
 *
 * Its own module so the dependency runs one way. `escapeHtml` used to live in
 * lib/email/plainTextEmailHtml, and the design system imported it from there —
 * but that file now renders through the design system, which made the two
 * mutually dependent. A lazy require would have broken the cycle at runtime and
 * still pulled the whole theme into every client bundle that imports the admin
 * editor's helpers, because webpack resolves a literal require statically.
 *
 * plainTextEmailHtml re-exports this, so every existing import path still works.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
