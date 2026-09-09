import type { Metadata, Viewport } from 'next';
import './globals.css';
import './archive.css';
import './rating.css';
import './symbols.css';
import PwaRegister from './pwa-register';

export const metadata: Metadata = {
  title: 'ʀᴇᴀᴅɪᴀʀʏ',
  description: '읽은 책과 마음에 남은 감상을 오래 보관하는 개인 독서 아카이브',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.png?v=restored-20260909',
    apple: '/apple-touch-icon.png?v=restored-20260909',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ʀᴇᴀᴅɪᴀʀʏ',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
