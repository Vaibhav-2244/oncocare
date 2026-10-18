import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OncoCare+ | LME Control Centre",
  description: "Central administration workspace for OncoCare+",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}