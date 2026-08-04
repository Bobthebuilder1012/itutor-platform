// Inline-styled HTML for the parent→child connection invite email.
// (Built as a string rather than a React Email component — @react-email/render
// isn't installed; @react-email/components alone can't render to HTML here.)

export function parentInviteEmailHtml(opts: { parentName: string; acceptUrl: string }): string {
  const { parentName, acceptUrl } = opts;
  const safeName = parentName || 'A parent/guardian';
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:20px;font-weight:800;color:#199356;">iTutor</span>
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Parent invite</div>
        <h1 style="font-size:20px;line-height:1.3;margin:8px 0 12px;color:#111827;">
          ${escapeHtml(safeName)} wants to connect as your parent or guardian on iTutor
        </h1>
        <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 20px;">
          If you accept, they'll be able to see your classes, bookings and billing — nothing else.
          Declining is completely fine and shares nothing. This request expires in 7 days.
        </p>
        <a href="${acceptUrl}" style="display:inline-block;background:#199356;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;">
          Review &amp; respond
        </a>
        <p style="font-size:12px;color:#9ca3af;margin:20px 0 0;">
          You'll be asked to sign in to your student account first. If you didn't expect this, you can ignore this email.
        </p>
      </div>
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin:20px 0 0;">© iTutor</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
