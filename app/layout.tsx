import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";

const rubik = Rubik({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-rubik" });

export const metadata: Metadata = {
  title: "Chat Demo — Real Estate",
  description: "Demo chat following Chat API Contract v1.0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={rubik.variable}>
      <body className="antialiased min-h-screen font-sans">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
