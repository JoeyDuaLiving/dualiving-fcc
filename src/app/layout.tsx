import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dualiving Financial Command Centre",
  description: "Cash, jobs and pipeline in one place for Dualiving management.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="lg:pl-60 flex flex-col min-h-full">
          <TopBar />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-[1600px] w-full mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
