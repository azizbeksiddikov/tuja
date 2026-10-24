import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: multi-currency money with an AI assistant`, template: `%s · ${APP_NAME}` },
  description: "Demo finance app for UZS, KRW and USD with a guarded AI assistant. Not a bank. Sandbox data only.",
};

export const viewport: Viewport = { themeColor: "#F6F8F6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Loaded by the browser (not at build time): Noto Sans KR covers Latin, Cyrillic and Hangul. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap" />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
