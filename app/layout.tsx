import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter, Space_Grotesk } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import SuppressHydrationWarnings from '@/components/SuppressHydrationWarnings';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

// viewport-fit=cover lets the app paint edge to edge on notched phones; the
// shells pad their fixed bars back out with env(safe-area-inset-*) (without
// this tag those values are all 0). Zoom stays enabled — iOS input zoom is
// fixed at the cause (16px inputs on touch, see .app-native in globals.css).
// The app is light-only and every top bar is white, so the browser chrome is
// white in both OS colour schemes; the manifest's green is for the splash.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light',
};

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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} scroll-smooth`}>
      <body>
        <SuppressHydrationWarnings />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
