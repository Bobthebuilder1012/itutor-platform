import Link from 'next/link';
import { BookOpenIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

function BookPencilIcon() {
  return (
    <span className="inline-flex items-center" aria-hidden>
      <BookOpenIcon className="h-9 w-9 text-itutor-green sm:h-10 sm:w-10 2xl:h-13 2xl:w-13 3xl:h-16 3xl:w-16" strokeWidth={1.5} />
      <PencilSquareIcon className="-ml-2 h-7 w-7 text-itutor-green/80 sm:h-8 sm:w-8 2xl:h-10 2xl:w-10 3xl:h-12 3xl:w-12" strokeWidth={1.5} />
    </span>
  );
}

const glassButton =
  'inline-flex shrink-0 items-center justify-center rounded-full border border-black/20 bg-white/70 px-8 py-2.5 text-sm font-semibold text-black transition hover:bg-white hover:border-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:px-9 sm:py-3 sm:text-base 2xl:px-12 2xl:py-4 2xl:text-lg 3xl:px-16 3xl:py-5 3xl:text-xl';

export default function SuccessCTABanner() {
  return (
    <section
      className="w-full border-y border-[#b6ffda]/60 bg-[#b6ffda]"
      aria-label="Call to action"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-6 sm:py-7 lg:px-8 2xl:max-w-[1600px] 2xl:py-10 3xl:max-w-[1900px] 3xl:py-14">
        <div className="flex w-full flex-col items-stretch gap-6 md:flex-row md:items-center md:gap-0 md:justify-center">
          <div className="flex w-full min-w-0 flex-1 flex-row items-center justify-between gap-3 md:pr-6 lg:pr-10 2xl:pr-14">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 2xl:gap-4">
              <BookPencilIcon />
              <p className="truncate text-sm font-bold leading-tight text-gray-900 sm:text-base md:text-lg 2xl:text-xl 3xl:text-2xl">
                Your Success Starts Here!
              </p>
            </div>
            <Link href="/signup" className={glassButton}>
              Join now
            </Link>
          </div>

          <div
            className="h-px w-full max-w-[12rem] shrink-0 self-center bg-emerald-300/50 md:hidden"
            aria-hidden
          />
          <div
            className="hidden w-px shrink-0 self-stretch bg-emerald-300/50 md:block md:min-h-[3rem]"
            aria-hidden
          />

          <div className="flex w-full min-w-0 flex-1 flex-row items-center justify-between gap-3 md:pl-6 lg:pl-10 2xl:pl-14">
            <p className="min-w-0 truncate text-sm font-medium leading-tight text-gray-700 sm:text-base md:text-lg 2xl:text-xl 3xl:text-2xl">
              Love teaching? Become a verified iTutor.
            </p>
            <Link href="/signup/tutor" className={glassButton}>
              Become a tutor
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
