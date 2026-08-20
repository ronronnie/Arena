import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/*
 * Placeholder typefaces. The design direction calls for a display face for numbers and
 * results plus a clean neutral for UI (typography-led, deliberately ageless). Prompt 2
 * picks them; these two keep the variable plumbing correct until then.
 */
const sans = Geist({ variable: '--font-arena-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-arena-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Arena',
  description: 'Performers ranked by blind pairwise voting on an identical weekly task.',
};

export const viewport: Viewport = {
  // Accessibility is age-inclusivity: dynamic type must be allowed to scale to 200%.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
