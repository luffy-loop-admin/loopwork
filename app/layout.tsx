import type { Metadata, Viewport } from 'next';
import { Instrument_Sans } from 'next/font/google';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import UpdateNotificationModal from '@/components/UpdateNotificationModal';

const font = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Guest Post Portal',
  description: 'Find the cheapest vendor for any guest post site.',
  robots: { index: false, follow: false },
  applicationName: 'Guest Post Portal',
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'GP Portal', statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E6B63' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="font-sans">
        <UpdateNotificationModal />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
