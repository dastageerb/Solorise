import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solorise — Tickets for independent teams',
  description:
    'A project and ticket workspace for freelancers, contractors and their clients.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
