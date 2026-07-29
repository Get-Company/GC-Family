import type { Metadata } from "next";
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
          <AuthProvider><SoundFeedback /><div className="sticky top-0 z-40 flex min-h-15 border-b shadow-sm" style={{ borderColor: "var(--color-border)", backgroundColor: "color-mix(in srgb, var(--color-background) 88%, transparent)", backdropFilter: "blur(16px)" }}><MainNavigation /><div className="flex shrink-0 items-center pr-3"><ThemeToggle /></div></div><VersionBadge />{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
