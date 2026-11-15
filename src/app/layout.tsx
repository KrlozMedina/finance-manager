
import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: {
    default: "Finance Manager",
    template: "%s | Finance Manager",
  },
  description:
    "Sistema de gestión y administración financiera personal.",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: Readonly<RootLayoutProps>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
