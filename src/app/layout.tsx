import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { AttemptModeProvider } from "@/lib/attempt-mode";
import { UserProvider } from "@/lib/user-context";
import { MobileTabBar, SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { UserProfileModal } from "@/components/UserProfileModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { InstallAppProvider } from "@/components/InstallAppButton";
import { ProfileAccessGate } from "@/components/ProfileAccessGate";
import { SignInGate } from "@/components/SignInGate";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <InstallAppProvider>
        <UserProvider>
          <LanguageProvider>
            <AttemptModeProvider>
              <SignInGate>
                <SiteHeader />
                <div className="min-w-0 flex-1 flex flex-col pb-6"><ProfileAccessGate>{children}</ProfileAccessGate></div>
                <SiteFooter />
                <MobileTabBar />
                <UserProfileModal />
                <OnboardingModal />
              </SignInGate>
            </AttemptModeProvider>
          </LanguageProvider>
        </UserProvider>
        </InstallAppProvider>
      </body>
    </html>
  );
}
