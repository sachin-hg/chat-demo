import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
