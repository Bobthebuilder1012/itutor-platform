import Link from 'next/link';

const pillButton =
  'inline-flex shrink-0 items-center justify-center rounded-full border border-white/90 px-[26px] py-3 text-sm font-semibold text-[#0a0f0d] backdrop-blur-[14px] transition-all hover:-translate-y-0.5';

const pillButtonStyle = {
  background: 'rgba(255,255,255,0.85)',
  boxShadow: '0 4px 14px rgba(22,163,74,0.1),inset 0 1px 0 rgba(255,255,255,0.8)',
};

export default function SuccessCTABanner() {
  return (
    <div className="mx-4 my-10 2xl:my-14">
      <section
        className="rounded-3xl border border-white/60 px-9 py-6 backdrop-blur-[20px] 2xl:px-14 2xl:py-8"
        style={{
          background: 'linear-gradient(135deg,rgba(187,247,208,0.6),rgba(134,239,172,0.5))',
          boxShadow: '0 8px 32px rgba(22,163,74,0.08),0 2px 8px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
        aria-label="Call to action"
      >
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4 2xl:gap-5">
            <span className="text-[28px]" aria-hidden>📖</span>
            <span className="text-[17px] font-bold text-[#0a0f0d] 2xl:text-lg">Your Success Starts Here!</span>
            <Link href="/signup" className={pillButton} style={pillButtonStyle}>
              Join now
            </Link>
          </div>

          <div className="hidden h-12 w-px shrink-0 bg-emerald-300/50 md:block" aria-hidden />

          <div className="flex flex-wrap items-center gap-4 2xl:gap-5">
            <span className="text-[15px] font-medium text-[#1f2937] 2xl:text-base">
              Love teaching? Become a verified iTutor.
            </span>
            <Link href="/signup/tutor" className={pillButton} style={pillButtonStyle}>
              Become a tutor
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
