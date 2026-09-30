import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { AttemptModeProvider } from "@/lib/attempt-mode";
import { UserProvider } from "@/lib/user-context";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { UserProfileModal } from "@/components/UserProfileModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { InstallAppProvider } from "@/components/InstallAppButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Score Recovery — Adaptive Test Platform & Study Library",
  description:
    "Bilingual test preparation and document intelligence platform. Turn your study material into targeted practice, diagnose recoverable marks, and prove mastery.",
  applicationName: "Score Recovery",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Score Recovery",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <InstallAppProvider>
        <UserProvider>
          <LanguageProvider>
            <AttemptModeProvider>
              <SiteHeader />
              <div className="min-w-0 flex-1 flex flex-col pb-6">{children}</div>
              <SiteFooter />
              <UserProfileModal />
              <OnboardingModal />
            </AttemptModeProvider>
          </LanguageProvider>
        </UserProvider>
        </InstallAppProvider>
      </body>
    </html>
  );
}
