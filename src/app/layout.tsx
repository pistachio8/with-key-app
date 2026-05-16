import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-sans",
  weight: "45 920",
});

export const metadata: Metadata = {
  title: "from. with",
  description: "혼자, 또는 친구와 함께하는 운동 기록",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

// WCAG 1.4.4 Resize Text — `maximumScale: 1`은 사용자 줌을 차단해 a11y AA 미달.
// 모바일 PWA에서 자동 줌-인 회피는 input font-size ≥ 16px로 처리하고,
// 사용자 줌은 항상 허용한다.
// interactiveWidget `resizes-content` — 가상 키보드가 뜨면 viewport가 같이 축소돼
// `min-h-svh` 가 줄어들고 폼이 자동으로 위로 올라온다. 기본값(overlays-content)에서는
// iOS Safari가 키보드로 폼을 덮어버려 /login email input 등이 가려졌다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
