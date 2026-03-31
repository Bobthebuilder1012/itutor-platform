const LOGO_IMG =
  'https://myitutor.com/assets/logo/itutor-logo-dark.png';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap plain text (with optional {{firstName}}) in the standard iTutor HTML email layout. */
export function plainTextToEmailHtml(text: string): string {
  const trimmed = text.trim();
  const paragraphs = trimmed
    ? trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : [''];

  const inner = paragraphs
    .map((block) => {
      const lines = block.split('\n').map((line) => escapeHtml(line));
      const body = lines.join('<br/>');
      return `<p style="color:#4b5563;line-height:1.6;margin:0 0 16px">${body}</p>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 0;background:#000;border-radius:8px 8px 0 0;"><img src="${LOGO_IMG}" alt="iTutor" style="height:60px;display:block;margin:0 auto"/></div>
<div style="background:#fff;padding:40px;border-radius:0 0 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
${inner}
</div>
<p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:24px">© iTutor · Nora Digital, Ltd.</p>
</div></body></html>`;
}

/** Best-effort extract editable plain text from stored HTML (for existing templates). */
export function htmlToPlainTextForEditor(html: string): string {
  if (typeof window === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return html;
  }
}
