# Walkie v0.1.0-pilot.2 — Device Compatibility & Resiliency Patch

> **Cross-Device Android Hardware & OS Compatibility Patch for Local Wi-Fi Radio**

---

### Critical Bug Fixes & Device Resiliency

This release resolves crashes observed on various Android devices across different Android versions (Android 10 through 15) and hardware architectures:

1. **Full 4-Architecture Native Library Parity (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`)**:
   - `libwalkie_core.so` is now compiled and bundled for all 4 Android architectures, including `x86` (32-bit Intel).
   - Prevents `java.lang.UnsatisfiedLinkError: dlopen failed: library "libwalkie_core.so" not found` on 32-bit devices and emulators.
   - Added graceful fallback in `ExpoWalkieCoreNative` if native binary loading fails on unsupported custom ROMs.

2. **Android 14+ (API 34/35) Foreground Service Crash Fix**:
   - Resolved `java.lang.SecurityException: Starting FGS with type microphone ... requires android.permission.RECORD_AUDIO`.
   - Removed unnecessary `connectedDevice` foreground service type to eliminate unneeded Bluetooth permission restrictions.
   - Implemented dynamic foreground elevation: `WalkieDutyService` starts with `mediaPlayback` and dynamically includes `microphone` only when runtime audio permissions are granted.
   - Added defensive `try/catch` handlers around `startForeground()` and `startForegroundService()` to prevent crashes during lifecycle transitions.

3. **Explicit Runtime Permission Handshake**:
   - Implemented automatic runtime permission prompt for `RECORD_AUDIO` and `POST_NOTIFICATIONS` (Android 13+) upon application launch.
   - Added pre-flight permission checks with descriptive alerts before starting or joining events.

4. **AudioTrack & AudioRecord Hardware Resilience**:
   - Guarded audio buffer calculations against negative `minBufferSize` error codes returned by certain OEM audio drivers.
   - Added automatic fallback from `AudioAttributes.USAGE_VOICE_COMMUNICATION` to `USAGE_MEDIA` if hardware voice routing fails.
   - Added fallback from `MediaRecorder.AudioSource.VOICE_COMMUNICATION` to `MIC` and `DEFAULT`.
   - Guaranteed `audioTrack.state == STATE_INITIALIZED` check prior to calling `play()` and `write()` to eliminate `IllegalStateException` crashes.

5. **Power & Wi-Fi Lock Under-Lock Prevention**:
   - Configured non-reference-counted `WakeLock` and `WifiLock` with explicit held-state verification to prevent under-lock crashes on aggressive OEM battery managers (Samsung OneUI, Xiaomi MIUI/HyperOS).
   - Added fallback from `WIFI_MODE_FULL_LOW_LATENCY` to `WIFI_MODE_FULL_HIGH_PERF` on devices lacking low-latency Wi-Fi lock support.

---

### Verification

- **TypeScript Typecheck**: 100% pass (`npx tsc --noEmit`)
- **Jest Test Suite**: 19 tests passing across state machine, protocol codecs, and service lifecycle
- **Rust Engine Tests**: 100% pass across protocol, floor arbitration, and multi-client relay
- **Package Integrity**: All 4 ABI targets verified in APK structure (`arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`)

---

### Package Details & Checksums

- **Binary**: `walkie-pilot-v0.1.0-pilot.2.apk` (189 MB)
- **Architectures**: `arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`
- **Embedded Bundle**: Complete standalone JavaScript bundle embedded (no Metro server needed)
- **SHA-256 Checksum**:
  ```
  d96fa71f8b14c99c3f89fd2dc6c2b70f3bbcf628c27a705aea60597c026063b7  walkie-pilot-v0.1.0-pilot.2.apk
  ```

---

### Installation

Download and install directly on your Android phone:
[Download walkie-pilot-v0.1.0-pilot.2.apk](https://github.com/Anasabubakar/Walkie/releases/download/v0.1.0-pilot.2/walkie-pilot-v0.1.0-pilot.2.apk)
