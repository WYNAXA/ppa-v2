# App Store Submission Handover

**For:** Roshni Patel (CTO)
**From:** Christian Shanahan
**Date:** 13 May 2026
**Status:** Ready for asset creation + submission

---

## Executive Summary

Padel Players App is technically ready for App Store submission. The PWA is live at https://app.padelplayersapp.com on Vercel, all required legal pages are hosted (/privacy, /terms, /support), and the App Store listing copy is drafted in APP_STORE_LISTING.md.

What's remaining is asset creation (icon + screenshots), App Store Connect listing setup, PWABuilder iOS wrap, TestFlight upload, and review submission.

Approximate remaining work: 4-6 hours of focused effort across 1-2 days.

---

## What's Done

| Item | Status | Notes |
|------|--------|-------|
| PWA live | ✅ | https://app.padelplayersapp.com |
| index.html PWA + iOS meta tags | ✅ | Apple touch icons, Open Graph, Twitter Card |
| Manifest.json with icons 72-512 | ✅ | public/manifest.json |
| Service worker | ✅ | injectManifest mode, push handler ready |
| /privacy /terms /support routes | ✅ | Publicly accessible, no auth |
| App Store Listing copy | ✅ | See APP_STORE_LISTING.md |
| Apple Developer enrollment | ✅ | Individual: Christian Shanahan |
| Custom domain (app.padelplayersapp.com) | ✅ | Vercel, SSL provisioned |

## What's Pending

| Item | Owner | Notes |
|------|-------|-------|
| 1024×1024 App Store icon | Roshni | Design needed, see icon brief below |
| 167×167 iPad Pro icon | Roshni | Same source, different size |
| iPhone screenshots | Roshni | 3 sizes required, see specs below |
| iPad screenshots | Roshni | iPad Pro 12.9" required |
| App Store Connect listing creation | Roshni | Use APP_STORE_LISTING.md content |
| App Privacy disclosures (nutrition labels) | Roshni | In APP_STORE_LISTING.md |
| PWABuilder iOS wrap | Roshni | https://www.pwabuilder.com |
| Xcode signing + TestFlight upload | Roshni | Using Christian's Individual cert |
| Internal TestFlight test | Roshni + Christian | At least 2 devices |
| Submit for App Store review | Roshni | After TestFlight pass |
| D-U-N-S issuance | Christian | In flight (5-14 business days) |
| Transfer to Org account post-D-U-N-S | Christian | Future v1.1 |

---

## Icon Design Brief

**Format requirements:**
- 1024×1024 PNG, RGB (no alpha)
- No transparency, no rounded corners (Apple adds them)
- sRGB colour space
- Flat, no drop shadows

**Design direction:**
- Subject: heart-shaped padel racket with ball inside (current concept)
- Style: clean geometric lines, Apple-simple
- No text (text doesn't read at 60×60px in App Store grid)
- Logo fills 60-75% of canvas

**Colour:**
- Background: solid teal (#009688) — brand primary
- Logo: white or near-white
- Optional: subtle gradient acceptable, no rainbow/multi-colour (loses recognition at small sizes)

**Reference existing assets:**
- public/PPA_Icon.png (512×512 — current icon at low res)
- public/PPA_Round_Logo_White_Background.png (420×420 — current variant)
- See marketing site padelplayersapp.com for brand application

**Output files needed:**
- icon-1024.png (App Store master)
- icon-167.png (iPad Pro)
- Update existing icons in public/icons/ if design changes significantly

---

## Screenshot Specifications

Apple requires screenshots at minimum 3 device sizes:

**iPhone 6.7" (iPhone 15 Pro Max sized)**
- Resolution: 1290×2796 pixels
- Required: minimum 3, maximum 10
- Format: PNG or JPEG

**iPhone 6.5" (iPhone 11 Pro Max sized)**
- Resolution: 1284×2778 pixels
- Required: minimum 3, maximum 10

**iPhone 5.5" (iPhone 8 Plus sized)**
- Resolution: 1242×2208 pixels
- Required: minimum 3, maximum 10

**iPad Pro 12.9" (3rd gen sized)**
- Resolution: 2048×2732 pixels
- Required: minimum 3, maximum 10

**Suggested screens to capture:**

1. **Home / Today view** — shows match-of-day, upcoming matches, group activity
2. **Group leaderboard** — BS3 Spring League standings with ELO rankings
3. **Record Result flow** — score entry with tie-break or outcome confirmation
4. **Match Detail (completed)** — verified match with ELO changes shown
5. **Compete tab** — career stats / ranking history graph
6. Optional: **Community discovery** — find players near you / discover groups

**Capture method:**
- Use real iPhone/iPad screenshots OR Xcode Simulator at the exact resolutions above
- Hard reload PWA before capturing to ensure latest build
- Use test data from BS3 group (real player names, real match history)
- Status bar should show 9:41 AM, full battery, full wifi (Apple convention)

---

## App Store Connect Setup Path

1. Log in to App Store Connect (https://appstoreconnect.apple.com)
2. **My Apps** → **+** → **New App**
3. Fill in:
   - Platform: iOS
   - Name: Padel Players (fallback: Padel Players App)
   - Primary Language: English (UK)
   - Bundle ID: com.wynaxa.padelplayers
   - SKU: padelplayers-001
4. **App Information** tab:
   - Subtitle: Play Smarter. Connect Better.
   - Category: Sports / Social Networking
   - Age rating: 12+ (run questionnaire — see APP_STORE_LISTING.md)
5. **Pricing**: Free, all territories
6. **Version 1.0 Prepare for Submission**:
   - Promotional text, Description, Keywords — copy from APP_STORE_LISTING.md
   - URLs: Support, Privacy — copy from APP_STORE_LISTING.md
   - Upload screenshots for all 4 device sizes
   - Upload 1024×1024 App Store icon
   - App Privacy section — fill in nutrition labels from APP_STORE_LISTING.md
7. **TestFlight** tab:
   - Upload build via Xcode after PWABuilder wrap
   - Internal tester group: add Christian, Roshni, optional 1-2 more
   - Test on at least 2 real devices

---

## PWABuilder iOS Wrap Steps

1. Visit https://www.pwabuilder.com
2. Enter URL: `https://app.padelplayersapp.com`
3. Click "Start" → PWABuilder analyses the PWA
4. Score should be high given the manifest and SW work done
5. Click **Package** → select **iOS**
6. Download the package
7. Open in Xcode:
   - Set Bundle Identifier: com.wynaxa.padelplayers
   - Set Team: Christian Shanahan's Apple Developer team
   - Set Display Name: Padel Players
   - Increment build number for any re-upload
8. Archive (Product → Archive)
9. Upload to App Store Connect via Organizer

---

## Decisions Needed from Christian

| Decision | Status | Notes |
|----------|--------|-------|
| Apple account: ship as Individual now? | ✅ Confirmed | Yes — ship now, transfer to Org once D-U-N-S issued |
| iPad support | ✅ Confirmed | Yes for v1 |
| TestFlight testers | ⏳ Pending | Christian + Roshni minimum; external beta TBD |
| App icon final design | ⏳ Pending | Roshni to design |

---

## Access Required

Roshni will need access to the following. Christian to provide separately (not in this doc):

- [ ] Apple Developer account login (https://developer.apple.com)
- [ ] App Store Connect access (https://appstoreconnect.apple.com)
- [ ] Vercel account access — ppa-v2 project (https://vercel.com/dashboard)
- [ ] GitHub repo: WYNAXA/ppa-v2 (likely already has)
- [ ] Supabase project (probably not needed for App Store work)
- [ ] Domain registrar access (probably not needed unless DNS issues arise)

---

## Known Issues / Out of Scope

- **Marketing site at padelplayersapp.com**: separate Vercel project (padel-players-app) with redirect loop bug between www/apex. Does NOT block App Store submission. Fix later.
- **Push notifications**: VAPID keys + edge function deployment deferred. In-app notifications work. Browser push pending.
- **Wynaxa Sports Tech Ltd Organisation account**: requires D-U-N-S (in flight). Once issued, transfer app from Individual to Org via App Store Connect.

---

## Key Files

- `APP_STORE_LISTING.md` — all listing copy
- `public/manifest.json` — PWA manifest
- `index.html` — meta tags and Apple PWA setup
- `public/icons/` — icons 72-512 (need 1024 + 167)
- `src/pages/PrivacyPolicy.tsx` — /privacy route
- `src/pages/TermsOfService.tsx` — /terms route
- `src/pages/Support.tsx` — /support route

---

## Contact

For technical questions during submission, contact Christian.
Latest commit: see `git log --oneline -1`.
