import type { Metadata, Viewport } from 'next';
import { Archivo, Geist_Mono, Inter } from 'next/font/google';
import './globals.css';

/*
 * Typography-led, not illustration-led.
 *
 * Illustration styles age-code hard — a set of characterful blobs would tell a
 * forty-five-year-old classical dancer that this app is not for her before she read a
 * word. Confident type plus real video is ageless, so the typefaces are doing the work
 * the illustration would otherwise do.
 *
 * Inter carries the UI: a clean neutral that disappears. Archivo carries numbers and
 * results: a grotesque with strong, even numerals that hold up at display sizes, which is
 * what "numbers are typographic events" needs. The mono is for timing-graphic labels and
 * anything that should read as machine-stated rather than authored.
 */
const sans = Inter({ variable: '--font-arena-sans', subsets: ['latin'], display: 'swap' });
const display = Archivo({ variable: '--font-arena-display', subsets: ['latin'], display: 'swap' });
const mono = Geist_Mono({ variable: '--font-arena-mono', subsets: ['latin'], display: 'swap' });

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
    /*
     * `data-category` re-themes the accent ramp for the whole document. It is `default`
     * here because the root layout has no category in scope; a category-scoped layout
     * sets it to a `categories.slug`, and any ancestor element may override it — which is
     * how /design-system shows all three ramps on one page.
     */
    <html lang="en" data-category="default">
      <body
        className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
