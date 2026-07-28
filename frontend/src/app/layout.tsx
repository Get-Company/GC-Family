import type { Metadata } from "next";
import { Baloo_2, Bungee, Comic_Neue } from "next/font/google";

import { AuthProvider } from "@/lib/AuthProvider";
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
        <AuthProvider><SoundFeedback /><ThemeToggle /><VersionBadge />{children}</AuthProvider>
      </body>
    </html>
  );
}
