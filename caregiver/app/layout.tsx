import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OncoCare+ | Caregiver Dashboard",
  description:
    "OncoCare+ caregiver dashboard for coordinating patient care, medications, appointments, tasks and notifications.",
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