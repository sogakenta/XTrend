import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components";
import { getPlaces } from "@/lib/data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrendaX - Xトレンド分析",
  description: "日本のXトレンドをリアルタイムで分析・可視化",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const places = await getPlaces();

  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-zinc-950`}
      >
        <div className="flex min-h-screen">
          <Sidebar places={places} />
          <main className="flex-1 px-4 py-8 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
