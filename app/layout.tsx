import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Генератор проєктної документації ПЗ",
  description:
    "Інтелектуальна система автоматизації формування проектної документації ПЗ за стандартами ISO/IEC/IEEE",
};

// Виставляє тему до першого малювання, щоб не було спалаху:
// збережений вибір, інакше — системна тема браузера.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <div className="fixed right-4 top-4 z-50">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
