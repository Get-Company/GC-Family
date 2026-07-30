import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Baloo_2, Bungee, Comic_Neue } from "next/font/google";

import { AuthProvider } from "@/lib/AuthProvider";
import { AnimatedShaderBackground } from "@/components/AnimatedShaderBackground";
import { MainNavigation } from "@/components/MainNavigation";
import { SoundFeedback } from "@/components/SoundFeedback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VersionBadge } from "@/components/VersionBadge";

import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const comic = Comic_Neue({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

const bungee = Bungee({
  variable: "--font-scoreboard",
  subsets: ["latin"],
  weight: "400",
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
      className={`${baloo.variable} ${comic.variable} ${bungee.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnimatedShaderBackground />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">
          <AuthProvider><SoundFeedback /><header className="sticky top-0 z-40 border-b shadow-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "color-mix(in srgb, var(--color-background) 92%, transparent)", backdropFilter: "blur(18px)" }}><div className="flex h-15 items-center justify-between px-4"><Link href="/" className="flex items-center gap-2 font-bold" style={{ color: "var(--color-primary)" }}><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border bg-sky-50 shadow-sm" style={{ borderColor: "#bfdbfe" }}><Image src="/brand/gc-family-logo.png" alt="" width={40} height={40} priority /></span><span className="text-base">GC-Family</span></Link><ThemeToggle /></div><div className="border-t" style={{ borderColor: "var(--color-border)" }}><MainNavigation /></div></header><VersionBadge />{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
