import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Mechi Safi',
  description: 'Football Prediction Benchmark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
