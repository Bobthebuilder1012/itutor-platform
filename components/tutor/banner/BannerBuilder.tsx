'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Upload, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import {
  BANNER_ACCEPT, BANNER_MAX_BYTES, BANNER_MIN_H, BANNER_MIN_W,
  WASHES, type BannerTemplate, type WashKey,
  bannerToBlob, ensureBannerFonts, loadBitmap, renderBanner, washForId,
} from '@/lib/utils/bannerCanvas';

interface BannerBuilderProps {
  classId: string;
  /** Class name (display context only — not baked into the image). */
  contextName?: string;
  backHref: string;
}

// The builder opens on a finished auto-default so most tutors just hit "Use this
// banner". Banners are per-class (there is no separate profile banner).
// Templates #3 (pattern) / #4 (illustration) are deferred until design delivers
// assets — this MVP ships Solid, Gradient, and external Upload.
export default function BannerBuilder({ classId, contextName, backHref }: BannerBuilderProps) {
  const router = useRouter();
  const { profile } = useProfile();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<ImageBitmap | null>(null);
  const uploadRef = useRef<ImageBitmap | null>(null);

  const [template, setTemplate] = useState<BannerTemplate>('gradient');
  const [wash, setWash] = useState<WashKey>(() => washForId(classId));
  const [atmosphere, setAtmosphere] = useState('');
  const [usePhoto, setUsePhoto] = useState(true);
  const [photoScale, setPhotoScale] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [uploadScale, setUploadScale] = useState(1);
  const [uploadOffsetX, setUploadOffsetX] = useState(0);
  const [uploadOffsetY, setUploadOffsetY] = useState(0);

  const [photoReady, setPhotoReady] = useState(false);
  const [hasUpload, setHasUpload] = useState(false);
  const [uploadWarn, setUploadWarn] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderBanner(canvas, {
      template,
      wash,
      photo: usePhoto ? photoRef.current : null,
      photoScale, photoOffsetX, photoOffsetY,
      atmosphere,
      upload: uploadRef.current,
      uploadScale, uploadOffsetX, uploadOffsetY,
      showGuides: template === 'upload',
    });
  }, [template, wash, usePhoto, photoScale, photoOffsetX, photoOffsetY, atmosphere, uploadScale, uploadOffsetX, uploadOffsetY]);

  // Load fonts + the tutor's profile photo, then paint the auto-default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureBannerFonts();
      if (!cancelled) setFontsReady(true);
      const avatar = profile?.avatar_url;
      if (avatar) {
        try {
          const bmp = await loadBitmap(avatar);
          if (!cancelled) { photoRef.current = bmp; setPhotoReady(true); }
        } catch {
          if (!cancelled) { setUsePhoto(false); setPhotoReady(false); }
        }
      } else if (!cancelled) {
        setUsePhoto(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  // Repaint whenever anything changes.
  useEffect(() => { draw(); }, [draw, fontsReady, photoReady, hasUpload]);

  async function onUploadFile(file: File) {
    setUploadWarn(''); setError('');
    if (!BANNER_ACCEPT.includes(file.type)) { setError('Use a JPG, PNG or WebP image.'); return; }
    if (file.size > BANNER_MAX_BYTES) { setError('Image must be under 10MB.'); return; }
    try {
      const bmp = await loadBitmap(file);
      if (bmp.width < BANNER_MIN_W || bmp.height < BANNER_MIN_H) {
        setUploadWarn(`For the sharpest result use at least ${BANNER_MIN_W}×${BANNER_MIN_H}px (yours is ${bmp.width}×${bmp.height}).`);
      }
      uploadRef.current = bmp;
      setUploadScale(1); setUploadOffsetX(0); setUploadOffsetY(0);
      setHasUpload(true);
      setTemplate('upload');
    } catch {
      setError('Could not read that image.');
    }
  }

  async function save() {
    if (!profile?.id) { setError('Not signed in.'); return; }
    if (template === 'upload' && !uploadRef.current) { setError('Upload an image first.'); return; }
    setSaving(true); setError('');
    const canvas = canvasRef.current;
    try {
      if (!canvas) throw new Error('Preview not ready');
      // Export without the safe-zone guides.
      renderBanner(canvas, {
        template, wash,
        photo: usePhoto ? photoRef.current : null,
        photoScale, photoOffsetX, photoOffsetY,
        atmosphere,
        upload: uploadRef.current,
        uploadScale, uploadOffsetX, uploadOffsetY,
        showGuides: false,
      });
      const blob = await bannerToBlob(canvas);
      const file = new File([blob], 'banner.jpg', { type: 'image/jpeg' });

      // Store class covers in the `avatars` bucket under the tutor's own prefix
      // — the same convention the create/manage flows use (its RLS + public read
      // are provisioned in every environment; a dedicated `class-banners` bucket
      // is not).
      const path = `${profile.id}/groups/banner-${classId}-${Date.now()}.jpg`;
      const up = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const coverUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const res = await fetch(`/api/groups/${classId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image: coverUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save the class banner.');
      draw();
      router.push(backHref);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save banner.');
      draw();
    } finally {
      setSaving(false);
    }
  }

  const isUpload = template === 'upload';

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink">Banner builder</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          A finished banner for <span className="font-medium text-ink">{contextName || 'your class'}</span> is ready — tweak it or just use it.
        </p>
      </div>

      {/* Live preview (master 1600×400, shown responsive) */}
      <div className="rounded-2xl border border-border bg-muted/40 p-3">
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <canvas ref={canvasRef} className="block w-full h-auto" style={{ aspectRatio: '4 / 1' }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The app adds the class name, price and buttons live on top — so nothing in the image goes stale.
          {isUpload && ' Keep important detail out of the dashed zones (that’s where the app draws its text).'}
        </p>
      </div>

      {/* Template picker */}
      <div className="flex flex-wrap gap-2">
        {([['gradient', 'Gradient'], ['solid', 'Solid'], ['upload', 'Upload your own']] as [BannerTemplate, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => { if (t !== 'upload') setTemplate(t); else if (hasUpload) setTemplate('upload'); else fileInputRef.current?.click(); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
              template === t ? 'bg-brand text-white border-brand' : 'bg-background text-ink border-border hover:border-brand/50',
            )}
          >
            {t === 'upload' ? <span className="inline-flex items-center gap-1.5"><Upload className="size-3.5" /> {label}</span> : label}
          </button>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          accept={BANNER_ACCEPT.join(',')}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); e.target.value = ''; }}
        />
      </div>

      {!isUpload ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Wash */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colour</div>
            <div className="flex flex-wrap gap-2">
              {WASHES.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setWash(w.key)}
                  aria-label={w.label}
                  title={w.label}
                  className={cn('size-9 rounded-full border-2 transition', wash === w.key ? 'border-ink scale-110' : 'border-border')}
                  style={{ background: `linear-gradient(135deg, ${w.base}, ${w.accent})` }}
                />
              ))}
            </div>
          </div>

          {/* Atmosphere line */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atmosphere line <span className="normal-case font-normal">(optional)</span></label>
            <input
              value={atmosphere}
              onChange={(e) => setAtmosphere(e.target.value.slice(0, 48))}
              placeholder="e.g. CSEC essay technique, every week"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="text-[11px] text-muted-foreground">{atmosphere.length}/48 · the class name is added by the app automatically.</div>
          </div>

          {/* Photo controls */}
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <input type="checkbox" checked={usePhoto} disabled={!photoReady} onChange={(e) => setUsePhoto(e.target.checked)} className="accent-[var(--brand)]" />
              Show my photo {photoReady ? '' : '(no profile photo found)'}
            </label>
            {usePhoto && photoReady && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Slider label="Zoom" min={1} max={2} step={0.02} value={photoScale} onChange={setPhotoScale} />
                <Slider label="Left / right" min={-1} max={1} step={0.02} value={photoOffsetX} onChange={setPhotoOffsetX} />
                <Slider label="Up / down" min={-1} max={1} step={0.02} value={photoOffsetY} onChange={setPhotoOffsetY} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {uploadWarn && <p className="text-xs text-amber-600">{uploadWarn}</p>}
          {hasUpload && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Slider label="Zoom" min={1} max={2.5} step={0.02} value={uploadScale} onChange={setUploadScale} />
              <Slider label="Left / right" min={-1} max={1} step={0.02} value={uploadOffsetX} onChange={setUploadOffsetX} />
              <Slider label="Up / down" min={-1} max={1} step={0.02} value={uploadOffsetY} onChange={setUploadOffsetY} />
            </div>
          )}
          <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-ink hover:bg-muted">
            <ImageIcon className="size-4" /> {hasUpload ? 'Choose a different image' : 'Choose an image'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        >
          {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Use this banner</>}
        </button>
        <Link href={backHref} className="text-sm font-medium text-muted-foreground hover:text-ink">Cancel</Link>
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--brand)]" />
    </label>
  );
}
