import type { Metadata, Viewport } from 'next';
import './globals.css';
import './archive.css';
import './rating.css';

export const metadata: Metadata = {
  title: '읽은 마음 — 나의 독서기록',
  description: '읽은 책과 마음에 남은 감상을 오래 보관하는 개인 독서 아카이브',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Readiary',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
