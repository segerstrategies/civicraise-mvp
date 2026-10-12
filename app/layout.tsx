import './globals.css';
import Link from 'next/link';
import AuthControls from '@/components/AuthControls';
export const metadata={title:'CivicRaise MVP',description:'Federal advocacy marketplace'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><header><Link href="/" className="brand">CIVICRAISE</Link><nav><Link href="/campaigns">Campaigns</Link><Link href="/dashboard">Dashboard</Link><Link href="/profile">Profile</Link><Link href="/ratification">Ratification</Link><Link href="/advocate/dashboard">Advocate</Link><Link href="/admin">Admin</Link></nav><div className="auth-controls"><AuthControls/></div></header><main>{children}</main></body></html>}
