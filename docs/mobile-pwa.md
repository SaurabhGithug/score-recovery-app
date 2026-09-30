# Mobile app installation

Installation is handled by the browser's **Add to Home Screen / Install app**
action. At the user's request, the in-app installation button and dialog were
removed. The root provider still registers the service worker, including on Learn,
but does not intercept or suppress the browser's native installation prompt.

## Hosting requirement

The current `http://127.0.0.1:3022` address is computer-local, not a phone URL.
For phone use, run the application and its existing backend/database behind a
reachable **trusted HTTPS** address. A LAN IP over ordinary HTTP does not meet
PWA secure-context requirements. Do not expose the development server, API keys,
database, or import/admin tools publicly just to obtain an install link. Hosting
and access controls must be agreed and checked separately before deployment.

On iPhone/iPad: Safari → Share → Add to Home Screen → Add; leave Open as Web App
enabled where offered. On Android: Chrome → menu → Install app / Add to Home
screen. Browser support and wording vary; the app cannot force installation.

## Behavior

- Manifest launches `/learn`, supports both orientations, and uses standalone
  display. The explicit `/library` identity preserves the old implicit app ID.
- Existing 192px, 512px, maskable and Apple icons are retained.
- Service worker registers on secure origins, caches only the offline fallback
  and public icons, and removes only older `score-recovery-shell-*` caches.
- Questions, authenticated HTML, API responses and development bundles are not
  cached. Learning/sign-in/saving still require connectivity; this is not an
  offline question-bank implementation. No unverified offline-save claims.
- Responsive styles preserve pinch zoom, allow wrapping, respect display safe
  areas, use dynamic viewport height for dialogs, and enlarge mobile controls.

## Verification

Run `node --import tsx scripts/test-pwa.mjs`, targeted ESLint, and
`npx tsc --noEmit`. Browser checks should include 320px, 390px, 768px, 1024px,
landscape, menu/install dialog, and account dialog. Actual Home Screen installation
must still be tested on physical iOS/Android devices using the final HTTPS host.

Verified locally on 2026-09-29: Papers at 320/390/768/1024px; Learn at
320/390/768px and 844×390 landscape; fully expanded Syllabus at 320px.
No document-wide horizontal overflow in those checks. Install and account
dialogs scroll within 320×480; install dialog closes with Escape. Manifest and
service-worker HTTP response headers checked; PWA regression checks and
TypeScript pass. Targeted lint passes except the pre-existing unused
`academicBranch` warning in OnboardingModal. No physical-device install or
production HTTPS deployment was performed.

References: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
and https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
