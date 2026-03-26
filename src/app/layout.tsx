import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gestion des notes de frais",
  description:
    "Application de gestion des dépenses pour collaborateurs et responsables.",
  icons: {},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeRegistry>
          <header className="w-full bg-background">
            <div className="px-6 py-4">
              <Link href="/" className="inline-block leading-tight text-foreground">
                <div className="text-xl font-semibold tracking-tight">
                  Additif Solutions
                </div>
                <div className="text-sm">
                  Algeria
                </div>
              </Link>
            </div>
          </header>
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
