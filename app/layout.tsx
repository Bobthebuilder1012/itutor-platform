import type { Metadata } from 'next';
import './globals.css';
import { Inter, Space_Grotesk, Archivo } from 'next/font/google';
import localFont from 'next/font/local';
import { AuthProvider } from '@/components/AuthProvider';
import SuppressHydrationWarnings from '@/components/SuppressHydrationWarnings';
import ImpersonationBanner from '@/components/admin/ImpersonationBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

// ── The new UI's two faces ────────────────────────────────────────────────
// These only define CSS variables. Nothing reads them outside `.ds-root`
// (components/ui/ds-tokens.css), so no existing page changes typeface.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

// ATKINSON HYPERLEGIBLE NEXT IS SELF-HOSTED, NOT LOADED FROM next/font/google.
// Next 14.2's bundled Google font list (1,625 families) has no "Atkinson
// Hyperlegible Next" entry — only the older "Atkinson Hyperlegible", which
// ships 400 and 700 and no 800. The design system specs 800 for row titles,
// prices, button labels, eyebrows and tags, so falling back to the older
// family would have quietly rendered most of the UI a weight light.
//
// The file in ./fonts is the latin subset Google serves for this family, and
// it is a VARIABLE font (fvar/gvar/avar/STAT), so this one 34 KB file covers
// the whole 400–800 range that the three @font-face rules on Google Fonts all
// point at. Hence the `weight: '400 800'` range rather than three faces.
//
// Licence: SIL Open Font License 1.1, ./fonts/OFL.txt.
const atkinson = localFont({
  src: './fonts/AtkinsonHyperlegibleNext-Variable.woff2',
  weight: '400 800',
  style: 'normal',
  variable: '--font-atkinson',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'iTutor - Caribbean Education Platform',
  description: 'Connect with tutors across Trinidad & Tobago and the Caribbean. Qualified educators and tutors for your child for nearly any subject. Find My Tutor. Live video session. Certified teachers. Flexible scheduling. Ages 3+.',
  verification: {
    google: 'hsCc_OEC4QlSrzol7NDMp1naFhpjliINy9w_SldrbdE',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }],
    shortcut: ['/favicon.png'],
  },
  metadataBase: new URL('https://myitutor.com'),
  openGraph: {
    title: 'iTutor - Caribbean Education Platform',
    description: 'Connect with tutors across Trinidad & Tobago and the Caribbean. Qualified educators and tutors for your child for nearly any subject. Find My Tutor. Live video session. Certified teachers. Flexible scheduling. Ages 3+.',
    url: 'https://myitutor.com',
    siteName: 'iTutor',
    images: [
      {
        url: '/og-image-v4.png',
        width: 1200,
        height: 630,
        alt: 'iTutor - Caribbean Education Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iTutor - Caribbean Education Platform',
    description: 'Connect with tutors across Trinidad & Tobago and the Caribbean',
    images: ['/og-image-v4.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${archivo.variable} ${atkinson.variable} scroll-smooth`}
    >
      <body>
        <SuppressHydrationWarnings />
        <AuthProvider>
          {children}
          <ImpersonationBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
