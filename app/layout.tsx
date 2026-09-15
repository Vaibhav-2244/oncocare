import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://oncocareplus.com'),
  title: {
    default: 'OncoCare+ — India\'s First AI-Powered Integrated Cancer Home Care Platform',
    template: '%s | OncoCare+',
  },
  description:
    'AI-powered care coordination, symptom tracking, verified caregivers, financial support and personalized guidance—designed to support cancer patients and families throughout their journey.',
  keywords: [
    'cancer care',
    'home healthcare',
    'AI healthcare India',
    'oncology',
    'cancer home care',
    'tele oncology',
    'cancer caregiver',
    'OncoCare',
    'cancer support platform',
  ],
  authors: [{ name: 'OncoCare+' }],
  creator: 'OncoCare+',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://oncocareplus.com',
    siteName: 'OncoCare+',
    title: 'OncoCare+ — The Future of Cancer Care Starts at Home',
    description:
      'AI-powered care coordination, symptom tracking, verified caregivers, financial support and personalized guidance for cancer patients and families.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OncoCare+ — The Future of Cancer Care Starts at Home',
    description:
      'India\'s First AI-Powered Integrated Cancer Home Care Platform. Helping patients beyond hospital walls.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} light`}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
