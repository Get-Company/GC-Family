import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";

import { AuthProvider } from "@/lib/AuthProvider";
import { MainNavigation } from "@/components/MainNavigation";
import { SoundFeedback } from "@/components/SoundFeedback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VersionBadge } from "@/components/VersionBadge";

import "./globals.css";

const inter = Inter({
  variable: "--font-app",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GC-Family",
  description: "Haushaltsaufgaben für die ganze Familie",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
        <div className="flex min-h-full flex-1 flex-col">
          <AuthProvider><SoundFeedback /><header className="app-header sticky top-0 z-40 border-b"><div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="flex items-center gap-3 font-semibold" style={{ color: "var(--color-foreground)" }}><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[13px] border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-button-surface)" }}><Image src="/brand/gc-family-logo.png" alt="" width={40} height={40} priority /></span><span className="text-base tracking-tight">GC-Family</span></Link><ThemeToggle /></div><MainNavigation /></header><VersionBadge /><div id="main-content" className="flex min-h-0 flex-1 flex-col">{children}</div></AuthProvider>
        </div>
      </body>
    </html>
  );
}
