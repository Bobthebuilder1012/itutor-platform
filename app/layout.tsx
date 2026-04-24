import type { Metadata } from 'next';
import { Oswald } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import SuppressHydrationWarnings from '@/components/SuppressHydrationWarnings';

const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  weight: ['300', '400', '500', '600', '700'],
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
    <html lang="en" className={`scroll-smooth ${oswald.variable} ${oswald.className}`}>
      <body>
        <SuppressHydrationWarnings />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
