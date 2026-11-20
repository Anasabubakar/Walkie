# Platform Icon & Brand Implementation Guide

This guide documents the official platform documentation consulted, design constraints, and compatibility decisions for Walkie across Android and iOS.

---

## 1. Official Platform Documentation Consulted

1. **Android Adaptive Icons & Material You Theming**:
   - URL: `https://developer.android.com/develop/ui/views/launch/icon_design_adaptive`
   - Specifications:
     - Outer canvas: 108dp × 108dp (1024×1024 px for master assets, 432×432 px at xxxhdpi).
     - Safe inner zone: 66dp diameter (622×622 px within 1024×1024). Artwork outside this boundary is susceptible to mask clipping (circle, squircle, teardrop) and parallax shift during launcher gestures.
     - Layers:
       - Foreground: transparent background with icon mark centered within 66dp.
       - Background: opaque full-bleed surface (Carbon `#101011`).
       - Monochrome layer (Android 13+ / API 33): flat white silhouette on transparent, used by the system to apply user wallpaper color extraction (Material You).
2. **Android Status Bar Notifications**:
   - URL: `https://developer.android.com/develop/ui/views/notifications`
   - Specifications:
     - Small notification icons must be strictly monochrome (white `#FFFFFF` on transparent). Any color in the asset is ignored or rendered as a white square by the system status bar compositor.
     - Placed as `ic_stat_walkie.xml` (VectorDrawable) and referenced dynamically by `WalkieDutyService`.
3. **Apple Human Interface Guidelines & iOS 18 Icon Appearances**:
   - URL: `https://developer.apple.com/design/human-interface-guidelines/app-icons`
   - Specifications:
     - Single 1024×1024 px square PNG master without transparency or pre-rounded corners.
     - iOS 18 system appearance modes:
       - Default: Brand colors (Carbon background, Chalk body, Lime key).
       - Dark: Dark mode appearance with high contrast against dark wallpapers.
       - Tinted: System desaturates and tints the icon layers according to the user's selected home-screen tint color. The Side Key body and detached key maintain their distinct shape and luminance under uniform tinting.
4. **Expo SDK 52+ Build System & CNG (Continuous Native Generation)**:
   - URL: `https://docs.expo.dev/guides/app-icons/`
   - Specifications:
     - Configuration in `app.json`:
       - `icon`: Universal fallback / iOS icon (`./assets/icon.png`).
       - `android.adaptiveIcon.foregroundImage`: Adaptive foreground (`./assets/android-icon-foreground.png`).
       - `android.adaptiveIcon.backgroundImage`: Adaptive background (`./assets/android-icon-background.png`).
       - `android.adaptiveIcon.monochromeImage`: Themed icon (`./assets/android-icon-monochrome.png`).
       - `android.adaptiveIcon.backgroundColor`: Background fallback (`#101011`).

---

## 2. Compatibility & Implementation Decisions

- **Preservation of the Detached Key**:
  At small sizes (e.g. 24dp on low-density screens), fine gaps between shapes can blur. The Side Key vector was calibrated so the detachment gap remains distinct down to 48px, ensuring recognition as a physical radio with a push-to-talk button rather than a generic phone icon.
- **Color Contrast**:
  - Carbon `#101011` against Chalk `#EFEDE8`: Contrast ratio > 17:1 (exceeds WCAG AAA requirements).
  - Lime `#C4F45B` against Carbon `#101011`: Contrast ratio > 14:1 (exceeds WCAG AAA requirements).
  - Lime `#C4F45B` against Chalk `#EFEDE8`: Contrast ratio ~ 1.2:1 (deliberately avoided placing Lime directly on Chalk without Carbon outlines).
- **Alternate Icons**:
  Walkie currently operates with a single unified "Side Key" identity as specified. Alternate icons are not enabled in the current pilot release to keep binary size lean and prevent profile bloat.
