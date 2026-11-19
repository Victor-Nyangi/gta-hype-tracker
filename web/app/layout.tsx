import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// Archivo for everything: variable weight (100-900) plus the width axis (62-125), which
// the headlines use through font-stretch.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GTA VI Hype Tracker",
  description:
    "A fan-made live tracker for the Grand Theft Auto VI launch: the launch clock, Twitch viewers, trailer views, Wikipedia readers by language, and who else is still playing on Steam.",
};

export const viewport: Viewport = {
  themeColor: "#120a14",
  colorScheme: "dark",
};

// Marks the document as scripted before first paint, so entrance animations only ever
// apply when JS is running (content stays visible without it).
const JS_FLAG = "document.documentElement.classList.add('js')";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
