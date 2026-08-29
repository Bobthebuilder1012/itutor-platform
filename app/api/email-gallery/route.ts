import { NextRequest, NextResponse } from 'next/server';
import { renderEmail } from '@/lib/email/design';
import { families, type EmailFamily } from '@/lib/email/design/theme';
import { familySamples } from '@/lib/email/design/samples';
import { supabaseTemplateBySlug, supabaseTemplates } from '@/lib/email/design/supabaseTemplates';

export const dynamic = 'force-dynamic';

/**
 * The email gallery, live.
 *
 * GET /api/email-gallery                          — all fourteen families
 * GET /api/email-gallery?family=session-reminder  — one, as it will send
 * GET /api/email-gallery?family=…&format=text     — its plain-text alternative
 * GET /api/email-gallery?supabase=confirm-signup  — the Supabase Auth template,
 *   as text/plain so it can be selected and pasted into the dashboard without a
 *   browser helpfully rendering it first
 *
 * A route rather than a folder of static HTML files on purpose. The approved
 * gallery was a set of screenshots, and screenshots of email templates go stale
 * the first time someone adjusts a padding — this renders the same code that
 * sends, so what you review is what arrives. Open it against any deployment.
 *
 * No auth. It renders sample data with no reference to any account, and gating
 * it behind a login would make it useless for the one job it has, which is
 * being opened in four email clients at once.
 */
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('family');
  const format = req.nextUrl.searchParams.get('format');
  const supabaseSlug = req.nextUrl.searchParams.get('supabase');

  if (supabaseSlug) {
    const template = supabaseTemplateBySlug.get(supabaseSlug);
    if (!template) {
      return NextResponse.json(
        { error: 'unknown_template', known: supabaseTemplates.map((t) => t.slug) },
        { status: 404 }
      );
    }
    const { html } = renderEmail(template.email);
    // text/plain, not text/html: this output is meant to be selected and
    // pasted, and a browser that renders it gives you an email you cannot copy.
    // format=html when you want to look at it instead.
    if (format === 'html') {
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new NextResponse(html, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (requested) {
    if (!(requested in families)) {
      return NextResponse.json(
        { error: 'unknown_family', known: Object.keys(families) },
        { status: 404 }
      );
    }
    const rendered = renderEmail(familySamples[requested as EmailFamily]);
    if (format === 'text') {
      return new NextResponse(rendered.text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new NextResponse(indexPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** The contact sheet: every family in an iframe, with its subject and coverage. */
function indexPage(): string {
  const keys = Object.keys(families) as EmailFamily[];

  const cards = keys
    .map((key, i) => {
      const def = families[key];
      const { subject } = renderEmail(familySamples[key]);
      const n = String(i + 1).padStart(2, '0');
      return `<article class="card">
  <header>
    <span class="num">${n}</span>
    <div>
      <h2>${def.title}</h2>
      <p class="covers">${def.covers}</p>
      <p class="subject"><strong>Subject:</strong> ${escapeAttr(subject)}</p>
    </div>
  </header>
  <div class="stage"><iframe src="/api/email-gallery?family=${key}" title="${def.title} preview" loading="lazy"></iframe></div>
  <footer>
    <code>${key}</code>
    <span class="links">
      <a href="/api/email-gallery?family=${key}" target="_blank" rel="noreferrer">Open</a>
      <a href="/api/email-gallery?family=${key}&amp;format=text" target="_blank" rel="noreferrer">Plain text</a>
    </span>
  </footer>
</article>`;
    })
    .join('\n');

  const supabaseRows = supabaseTemplates
    .map(
      (t) =>
        `      <li><span><strong>${t.dashboardName}</strong><em>${escapeAttr(t.subject)}</em></span>` +
        `<span class="links">` +
        `<a href="/api/email-gallery?supabase=${t.slug}&amp;format=html" target="_blank" rel="noreferrer">Preview</a>` +
        `<a href="/api/email-gallery?supabase=${t.slug}" target="_blank" rel="noreferrer">Copy source</a>` +
        `</span></li>`
    )
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>iTutor email families</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#edf2ee;color:#152019;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
.hero{background:#050605;color:#fff;padding:34px 26px 40px;border-top:6px solid #32d270}
.hero-inner{max-width:1240px;margin:auto}
.hero h1{font-size:34px;line-height:1.1;margin:0 0 10px}
.hero p{color:#b8c3bb;max-width:760px;font-size:15px;line-height:1.6;margin:0}
.grid{max-width:1240px;margin:22px auto 60px;padding:0 20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
.card{background:#fff;border:1px solid #dce6df;border-radius:16px;overflow:hidden}
.card header{display:flex;gap:13px;padding:20px 20px 13px}
.num{flex:0 0 auto;width:36px;height:36px;border-radius:9px;background:#e6f9ed;color:#13884a;display:flex;align-items:center;justify-content:center;font-weight:800}
.card h2{font-size:18px;margin:2px 0 5px}
.covers{font-size:12.5px;line-height:1.5;color:#66736a;margin:0}
.subject{font-size:12.5px;line-height:1.5;color:#4f5d53;margin:7px 0 0}
.stage{background:#f3f6f4;border-top:1px solid #e4ebe6;border-bottom:1px solid #e4ebe6;height:620px}
.stage iframe{width:100%;height:100%;border:0;display:block}
.card footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 20px;font-size:12px}
code{font-family:ui-monospace,Consolas,monospace;color:#748078}
.links a{color:#13884a;font-weight:600;text-decoration:none;margin-left:12px}
.links a:hover{text-decoration:underline}
.supabase{background:#fff;border-top:1px solid #dce6df;padding:34px 20px 60px}
.supabase-inner{max-width:1240px;margin:auto}
.supabase h2{font-size:22px;margin:0 0 8px}
.supabase p{font-size:13.5px;line-height:1.6;color:#66736a;margin:0 0 18px;max-width:820px}
.supabase ul{list-style:none;margin:0;padding:0;border:1px solid #dce6df;border-radius:12px;overflow:hidden}
.supabase li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;font-size:13px}
.supabase li+li{border-top:1px solid #e4ebe6}
.supabase li em{display:block;font-style:normal;color:#66736a;margin-top:2px;font-size:12.5px}
@media(max-width:900px){.grid{grid-template-columns:1fr}.stage{height:560px}.supabase li{flex-direction:column;align-items:flex-start}}
</style></head><body>
<header class="hero"><div class="hero-inner">
<h1>iTutor email families</h1>
<p>Every transactional email the platform sends is one of these fourteen shapes, rendered here by the same code that sends them — so what you review is what arrives. Sample content only; no real account is referenced.</p>
</div></header>
<main class="grid">
${cards}
</main>
<section class="supabase">
  <div class="supabase-inner">
    <h2>Supabase Auth templates</h2>
    <p>Supabase sends these itself, from HTML pasted into its dashboard — nothing here deploys them. Open one, copy all of it, and paste it into Authentication → Emails for each environment. The files under <code>email-templates/</code> are the same output, generated by <code>node scripts/render-email-templates.js</code>.</p>
    <ul>
${supabaseRows}
    </ul>
  </div>
</section>
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
