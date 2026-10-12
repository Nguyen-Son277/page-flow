import type { Metadata } from 'next';
import './globals.css';
import { ThemeScript } from '@/components/theme';

export const metadata: Metadata = {
  title: 'PageFlow · Không gian chăm sóc khách hàng',
  description: 'Hộp thư Facebook đa Page dành cho đội ngũ của bạn.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" suppressHydrationWarning><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><ThemeScript /></head><body>{children}</body></html>;
}
