import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'iTutor - Caribbean Education Platform',
  description: 'Connect with tutors across Trinidad & Tobago and the Caribbean',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <footer className="w-full border-t border-gray-200 mt-8 py-4 text-center">
          <Link href="/tutor/login" className="text-sm text-muted-foreground hover:underline">
            Tutor Login
          </Link>
        </footer>
      </body>
    </html>
  );
}
