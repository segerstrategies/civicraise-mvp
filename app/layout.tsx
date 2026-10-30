import './globals.css';
import Link from 'next/link';
import AuthControls from '@/components/AuthControls';
import Navigation from '@/components/Navigation';
import CivicRaiseGuide from '@/components/CivicRaiseGuide';

export const metadata = {
  title: 'CivicRaise MVP',
  description: 'Federal advocacy marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" className="brand">CIVICRAISE</Link>
          <Navigation />
          <div className="auth-controls"><AuthControls /></div>
        </header>
        <main>{children}</main>
        <CivicRaiseGuide />
      </body>
    </html>
  );
}
