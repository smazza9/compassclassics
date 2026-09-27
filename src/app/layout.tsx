import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://compassclassics.com"),
  title: "Compass Classics",
  description: "Every room, its own music. A music remote for Dad's Sonos, built by Stephen.",
  applicationName: "Compass Classics",
  appleWebApp: { capable: true, title: "Classics", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Compass Classics",
    description: "Every room, its own music.",
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#141d2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
