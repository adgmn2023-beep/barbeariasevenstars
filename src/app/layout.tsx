import "./globals.css";
import { Shell } from "@/components/shell";
import { LiveNotifications } from "@/components/live-notifications";
import { RegisterWorker } from "@/components/register-worker";
import { Inter, Oswald } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-heading" });
export const metadata = {
  title: "Seven Stars Barbershop",
  description: "Seu estilo, seu horário.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    title: "Seven Stars",
    statusBarStyle: "black-translucent" as const,
  },
};
export const viewport = {
  themeColor: "#0F0B09",
  width: "device-width",
  initialScale: 1,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${oswald.variable}`}>
        <Shell>{children}</Shell>
        <LiveNotifications />
        <RegisterWorker />
      </body>
    </html>
  );
}
