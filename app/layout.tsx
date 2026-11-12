import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Генератор проєктної документації ПЗ",
  description:
    "Інтелектуальна система автоматизації формування проектної документації ПЗ за стандартами ISO/IEC/IEEE",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
