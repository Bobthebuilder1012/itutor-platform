import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] })

// #region agent log - build version tracking
const BUILD_VERSION = '6be5ad2-' + Date.now();
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e';
// #endregion

// #region agent log - metadata generation tracking
export const metadata: Metadata = (() => {
  const meta = {
    title: 'iTutor - Caribbean Education Platform',
    description: 'Connect with tutors across Trinidad & Tobago and the Caribbean. Qualified educators and tutors for your child for nearly any subject. Find My Tutor. Live video session. Certified teachers. Flexible scheduling. Ages 3+.',
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.png', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }],
      shortcut: ['/favicon.png'],
    },
    metadataBase: new URL('https://www.myitutor.com'),
    openGraph: {
      title: 'iTutor - Caribbean Education Platform',
      description: 'Connect with tutors across Trinidad & Tobago and the Caribbean. Qualified educators and tutors for your child for nearly any subject. Find My Tutor. Live video session. Certified teachers. Flexible scheduling. Ages 3+.',
      url: 'https://www.myitutor.com',
      siteName: 'iTutor',
      images: [
        {
          url: '/assets/logo/itutor-mark.png',
          width: 512,
          height: 512,
          alt: 'iTutor - Caribbean Education Platform',
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: 'iTutor - Caribbean Education Platform',
      description: 'Connect with tutors across Trinidad & Tobago and the Caribbean',
      images: ['/assets/logo/itutor-mark.png'],
    },
  };
  
  fetch(LOG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'layout.tsx:metadata',message:'Metadata generated at build time',data:{ogImage:meta.openGraph?.images?.[0],buildVersion:BUILD_VERSION},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  
  return meta;
})();
// #endregion

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // #region agent log - render time tracking
  fetch(LOG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'layout.tsx:RootLayout',message:'RootLayout rendering',data:{buildVersion:BUILD_VERSION,metadataOgImage:metadata.openGraph?.images?.[0]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  return (
    <html lang="en" className="scroll-smooth">
      <body className={inter.className}>
        {/* #region agent log - version indicator */}
        <div style={{display:'none'}} data-build-version={BUILD_VERSION} data-og-image={(metadata.openGraph?.images as any)?.[0]?.url}></div>
        {/* #endregion */}
        {children}
      </body>
    </html>
  );
}
