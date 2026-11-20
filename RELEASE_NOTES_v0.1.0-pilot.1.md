# Walkie v0.1.0-pilot.1 — Offline Android Pilot Release

> **Zero-WAN, Zero-Cloud Push-to-Talk for Venue & Stage Crews over Local Wi-Fi**

---

### Highlights & Architecture

- **True Zero-WAN / Zero-Cloud Operation**: Designed and built for uncompromised offline production environments. Operates completely without internet connectivity, cellular service, or external servers. One phone acts as the local event host, broadcasting channels and orchestrating low-latency audio across the venue router.
- **Production Rust Engine (`walkie-core`)**:
  - High-performance, memory-safe floor arbitration engine compiled natively via Android NDK for `arm64-v8a`, `armeabi-v7a`, and `x86_64`.
  - Authoritative FIFO floor queueing, 30-second transmission cutoff, 2-second orphan floor reclamation, and millisecond-accurate lease timestamps.
  - Zero-transcoding binary audio relay forwarding raw Opus packets over UDP sockets with <20ms transit latency.
- **Android Native Platform Module (`expo-walkie-core`)**:
  - `WalkieDutyService` running as an Android Foreground Service with notification PTT control.
  - Holds `WIFI_MODE_FULL_HIGH_PERF` lock to prevent radio sleep and packet drops during silence.
  - Maintains a partial `WakeLock` ensuring continuous low-latency audio reception even when the device is screen-locked.
  - Low-latency hardware audio capture (`AudioRecord`) and playback (`AudioTrack`) in `STREAM_VOICE_CALL` with acoustic echo cancellation (AEC) and noise suppression (NS).
- **Approved "Side Key" Visual Identity**:
  - Matte-black tactical radio face (`#0A0A0A` / `#161616`) adhering strictly to the approved Figma specifications (`z1qW7gmpPi6sONVUgVZFar`).
  - Tactile high-contrast Lime PTT key (`#C4F45B`) with mechanical spring animation and haptic feedback.
  - Rotary channel selector dial, active speaker card, live VU carrier meter, and host QR code pairing modal.

---

### Verification & Test Coverage

- **Rust Unit & Integration Tests**: 100% pass across protocol parsing, floor queueing, security authentication, SQLite event persistence, client state machines, and multi-client relay integration.
- **React Native / Jest Tests**: 100% pass covering duty service hooks, invite codec, state management, and UI rendering.
- **Deterministic Record-and-Replay**: Validated against captured protocol fixtures using `rust-anything` methodology.

---

### Package Details & Checksums

- **Binary**: `walkie-pilot-v0.1.0.apk` (187 MB)
- **Architectures**: `arm64-v8a`, `armeabi-v7a`, `x86_64`
- **Embedded Bundle**: Complete standalone JavaScript bundle embedded (`assets/index.android.bundle`); does not require a Metro development server.
- **SHA-256 Checksum**:
  ```
  11a39b871e08d838d7bd899b61f6a520ad35fbf00aaa8ef21f7621e01399bf8b  walkie-pilot-v0.1.0.apk
  ```

---

### Installation & Sideloading

```bash
# Sideload via USB Debugging
adb install -r walkie-pilot-v0.1.0.apk
```

---

### Operational Notes & Constraints

1. **Venue Wi-Fi Configuration**: AP Isolation (Client Isolation) must be disabled on the local router so phones can communicate directly via UDP/TCP on local IP addresses.
2. **Audio Hardware**: Best performance is achieved using low-latency wired or USB-C headsets. Bluetooth headsets introduce 100–250ms of Bluetooth A2DP/HFP latency.
3. **iOS Compatibility**: iOS client is currently in the architecture phase; offline lock-screen operation on iOS requires Apple NetworkExtension and Local Push Connectivity framework entitlements.
