# Walkie Brand Asset Map & Production Identity Reference

This document maps all approved brand assets for Walkie ("Side Key" identity) across platforms, file destinations, and usage guidelines.

## Brand Identity Specification

- **Primary Mark**: Upright handheld radio silhouette with antenna, finger cutouts, and a detached high-contrast push-to-talk key.
- **Custom Wordmark**: Geometric bold sans-serif "Walkie" featuring a matching vertical pill over the "i" instead of a traditional round dot.
- **Production Palette**:
  - **Carbon** (`#101011`): Primary dark matte body color, dark icon tile background, text on light surfaces.
  - **Chalk** (`#EFEDE8`): Primary light chassis color, reverse text, light icon tile background.
  - **Lime** (`#C4F45B`): High-visibility tactile accent color for the PTT key and the "i" pill.

---

## Asset Directory Structure

```
assets/
├── android-icon-background.png     <- Android adaptive background layer (1024x1024)
├── android-icon-foreground.png     <- Android adaptive foreground layer (1024x1024)
├── android-icon-monochrome.png     <- Android 13+ Material You themed icon layer (1024x1024)
├── icon.png                        <- iOS / universal default app icon (1024x1024)
├── splash-icon.png                 <- Centered brand mark for splash screen
├── favicon.png                     <- Web favicon (48x48)
└── brand/
    ├── ASSET_MAP.md                <- This file
    ├── source/                     <- Editable vector masters and source SVGs
    │   ├── primary_mark.svg        <- Side Key mark (Carbon body, Lime key)
    │   ├── reverse_mark.svg        <- Side Key mark (Chalk body, Lime key)
    │   ├── monochrome_reverse.svg  <- Side Key mark (All Chalk/White)
    │   ├── side_key_pressed.svg    <- Mark in pressed state (key shifted into chassis)
    │   ├── walkie_wordmark_primary.svg    <- "Walkie" wordmark (Carbon + Lime pill)
    │   ├── walkie_wordmark_reverse.svg    <- "Walkie" wordmark (Chalk + Lime pill)
    │   ├── walkie_wordmark_monochrome.svg <- Wordmark single color
    │   ├── walkie_lockup_primary.svg      <- Primary horizontal lockup (Dark on light)
    │   └── walkie_lockup_reverse.svg      <- Reverse horizontal lockup (Light on dark)
    ├── android/                    <- Native Android production exports
    │   ├── android-icon-background.png
    │   ├── android-icon-foreground.png
    │   ├── android-icon-monochrome.png
    │   ├── play-store-icon.png     <- Google Play Store listing asset (512x512)
    │   ├── ic_notification.svg     <- Android notification small icon source
    │   └── ic_notification_walkie.png <- Notification small icon (96x96)
    ├── ios/                        <- Native iOS production exports
    │   ├── icon-1024.png           <- App Store & iOS default (1024x1024)
    │   ├── icon-1024-dark.png      <- iOS 18 Dark appearance
    │   └── icon-1024-light.png     <- iOS 18 Light appearance
    └── shared/                     <- Shared cross-platform exports
        ├── splash-icon.png
        └── favicon.png
```

---

## Surface-to-Asset Mapping

| Surface | Target Asset | Appearance / Description |
| :--- | :--- | :--- |
| **Android Home Screen (Adaptive)** | `assets/android-icon-foreground.png` + `assets/android-icon-background.png` | Foreground contains Side Key mark (Chalk body `#EFEDE8`, Lime key `#C4F45B`) centered within 66dp safe circle. Background is full-bleed Carbon `#101011`. |
| **Android Home Screen (Themed / Material You)** | `assets/android-icon-monochrome.png` | Flat white silhouette on transparent. The system launcher automatically tints both layers according to user wallpaper theme. |
| **Android Notification Bar (Foreground Service)** | `ic_stat_walkie.xml` / `ic_stat_walkie.png` | Dedicated 24x24 dp monochrome silhouette with alpha channel. Displays during active foreground duty service. |
| **Google Play Store Listing** | `assets/brand/android/play-store-icon.png` | 512x512 square PNG with Carbon background, Chalk body, and Lime key. No pre-rounded corners. |
| **iOS Home Screen (Default & Dark)** | `assets/brand/ios/icon-1024.png` / `icon-1024-dark.png` | 1024x1024 square PNG. Carbon background, Chalk body, Lime key. |
| **iOS Home Screen (Light Variant)** | `assets/brand/ios/icon-1024-light.png` | 1024x1024 square PNG. Chalk background, Carbon body, Lime key. |
| **App Launch / Splash Screen** | `assets/splash-icon.png` | Side Key mark centered on `#101011` background. |
| **Radio Face Header** | `src/components/WalkieBrand.tsx` (`WalkieLockup`) | Reverse lockup (Side Key mark + custom wordmark with Lime pill) on matte-black chassis. |
| **Modal Headers (Host, Join, Settings)** | `src/components/WalkieBrand.tsx` (`WalkieLockup`) | Clean branded header with high contrast. |
| **About Card in Settings** | `src/components/WalkieBrand.tsx` (`WalkieLockup`) | Production identity & engine metadata card. |
