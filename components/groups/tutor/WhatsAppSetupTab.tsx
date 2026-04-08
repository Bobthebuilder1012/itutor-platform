'use client';

import { useEffect, useState } from 'react';

interface WhatsAppSetupTabProps {
  groupId: string;
  whatsappLink: string;
  memberCount: number;
  onSave: (link: string) => Promise<void>;
}

const LINK_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/;

const STEPS = [
  {
    title: 'Create a WhatsApp group',
    body: 'Open WhatsApp and create a new group for your class. Use the same name as your iTutor class so students recognise it immediately.',
    body2: 'You can add a group description and profile photo to make it feel official.',
    tap: null,
  },
  {
    title: 'Enable member approval',
    body: 'This is the most important security step. With this on, you must approve every person who tries to join — even if they have the invite link.',
    body2: null,
    tap: ['Group Info', 'Group Settings', 'Approve new members'],
  },
  {
    title: 'Copy the invite link',
    body: 'Go to your group info, tap "Invite via link," and copy the link. Come back to iTutor and paste it in the field above.',
    body2: null,
    tap: ['Group Info', 'Invite via link', 'Copy link'],
  },
  {
    title: 'Paste and save',
    body: 'Paste the link in the field above, click "Test" to verify it works, then hit "Save."',
    body2: 'Your approved students will see a "Join WhatsApp" button on the class page. Only members you\'ve approved can see it.',
    tap: null,
  },
];

const WA_LOGO = (
  <svg className="w-[26px] h-[26px]" viewBox="0 0 24 24" fill="none">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5" fill="none" />
  </svg>
);

export default function WhatsAppSetupTab({ groupId, whatsappLink, memberCount, onSave }: WhatsAppSetupTabProps) {
  const [input, setInput] = useState(whatsappLink);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => { setInput(whatsappLink); }, [whatsappLink]);

  const isValid = LINK_RE.test(input.trim());
  const isDirty = input.trim() !== whatsappLink;
  const isConnected = !!whatsappLink;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(input.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {} finally { setSaving(false); }
  };

  const handleTest = () => {
    if (input.trim()) window.open(input.trim(), '_blank');
  };

  const validationState: 'empty' | 'valid' | 'invalid' =
    !input.trim() ? 'empty' : isValid ? 'valid' : 'invalid';

  return (
    <div className="space-y-5">

      {/* Status card */}
      <div className="bg-white border border-[#e4e8ee] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-5 flex items-center gap-3.5 border-b border-[#e4e8ee]">
          <div className="w-12 h-12 rounded-xl bg-[#ecfdf5] flex items-center justify-center flex-shrink-0">{WA_LOGO}</div>
          <div className="flex-1">
            <h3 className="text-[16px] font-bold">WhatsApp Group</h3>
            <p className="text-[13px] text-[#6b7280] mt-0.5">Connect a WhatsApp group for your class</p>
          </div>
          <span className={`px-3.5 py-[5px] rounded-[20px] text-[12px] font-semibold flex-shrink-0 ${isConnected ? 'bg-[#d1fae5] text-[#047857]' : 'bg-[#f5f7fa] text-[#6b7280]'}`}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <div className="px-5 py-5">
          <p className="text-[12.5px] font-semibold mb-1">WhatsApp group invite link</p>
          <p className="text-[11px] text-[#6b7280] mb-3">Paste the invite link from your WhatsApp group. Only approved members will see the join button.</p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#25D366]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
              </div>
              <input
                type="url"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className={`w-full py-2.5 pl-10 pr-9 border rounded-[10px] text-[13px] outline-none transition-all ${
                  validationState === 'valid' ? 'border-[#25D366] focus:ring-2 focus:ring-[#d1fae5]' :
                  validationState === 'invalid' ? 'border-[#ef4444] focus:ring-2 focus:ring-red-100' :
                  'border-[#e4e8ee] focus:border-[#0d9668] focus:ring-2 focus:ring-[#d1fae5]'
                }`}
              />
              {validationState === 'valid' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                </div>
              )}
              {validationState === 'invalid' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </div>
              )}
            </div>
            <button
              onClick={handleTest}
              className="px-4 py-2.5 rounded-[10px] text-[12.5px] font-semibold border border-[#e4e8ee] bg-white text-[#111827] hover:border-[#0d9668] hover:text-[#0d9668] transition-colors flex items-center gap-[5px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              Test
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving || !isDirty}
              className="px-4 py-2.5 rounded-[10px] text-[12.5px] font-semibold bg-[#0d9668] text-white border border-[#0d9668] hover:bg-[#047857] transition-colors flex items-center gap-[5px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : saved ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
              )}
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>
          {validationState === 'valid' && (
            <p className="mt-1.5 text-[11px] text-[#128C7E] flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
              Valid WhatsApp invite link
            </p>
          )}
          {validationState === 'invalid' && (
            <p className="mt-1.5 text-[11px] text-[#ef4444] flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Must be a valid chat.whatsapp.com link
            </p>
          )}
        </div>
      </div>

      {/* Setup guide */}
      <div className="bg-white border border-[#e4e8ee] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#e4e8ee]">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            Setup guide
          </h3>
          <span className="text-[11px] text-[#6b7280]">Step {step + 1} of {STEPS.length}</span>
        </div>

        {/* Slide content */}
        <div className="px-7 py-8">
          <div className="flex items-start gap-8">
            <div className="flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#ecfdf5] text-[#047857] flex items-center justify-center text-[12px] font-bold mb-3">{step + 1}</div>
              <h4 className="text-[16px] font-bold mb-2">{STEPS[step].title}</h4>
              <p className="text-[13px] text-[#6b7280] leading-relaxed mb-2">{STEPS[step].body}</p>
              {STEPS[step].body2 && <p className="text-[13px] text-[#6b7280] leading-relaxed mb-2">{STEPS[step].body2}</p>}
              {STEPS[step].tap && (
                <div className="flex items-center gap-[5px] flex-wrap px-3 py-2 bg-[#f5f7fa] rounded-[10px] text-[11px] font-medium text-[#6b7280] mt-3">
                  {STEPS[step].tap!.map((t, i) => (
                    <span key={i} className="flex items-center gap-[5px]">
                      {i > 0 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 18 15 12 9 6" /></svg>}
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-5 py-3.5 border-t border-[#e4e8ee] flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${i === step ? 'w-[22px] bg-[#25D366]' : 'w-2 bg-[#d1d5db] hover:bg-[#9ca3af]'}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="w-[34px] h-[34px] rounded-lg border border-[#e4e8ee] bg-white flex items-center justify-center hover:border-[#0d9668] hover:text-[#0d9668] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={step === STEPS.length - 1}
              className="w-[34px] h-[34px] rounded-lg border border-[#e4e8ee] bg-white flex items-center justify-center hover:border-[#0d9668] hover:text-[#0d9668] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 6 15 12 9 18" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
