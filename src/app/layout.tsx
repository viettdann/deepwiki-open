import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Syne } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import GlobalHeaderWrapper from "@/components/GlobalHeaderWrapper";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "Deepwiki Open Source",
  description: "Deepwiki Open Source is a free and open-source version of Deepwiki, a tool that helps you create a knowledge base from your code repository.",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jetBrainsMono.variable} ${syne.variable} antialiased`}
      >
        <LanguageProvider>
          <GlobalHeaderWrapper>
            {children}
          </GlobalHeaderWrapper>
        </LanguageProvider>
      </body>
    </html>
  );
}
