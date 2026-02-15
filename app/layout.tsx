import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Liftpictures Operator Dashboard',
  description: 'Multi-park admin dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
