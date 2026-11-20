# Walkie v0.2.0 Release Notes

**Tag**: `v0.2.0`  
**Date**: November 20, 2026  
**License**: MIT (`Anas Abubakar <anasabubakar7000@gmail.com>`)  
**Target Platform**: Android 10+ (API 24 to API 36 / Android 16 Canary)  
**Binary Engine**: Native Rust `walkie-core` (`arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`)  

---

## 🚀 Key Highlights & New Capabilities

### 1. 100% Zero-WAN Offline Wi-Fi Guarantee
* **The Problem**: When Android devices connect to a local venue Wi-Fi router without an active internet connection (WAN cable unplugged / offline venue AP), Android flags the Wi-Fi as "unvalidated" and automatically attempts to route network packets over cellular mobile data or drops local socket packets.
* **The Solution**: Walkie's native `WalkieDutyService` now registers a dedicated Wi-Fi network callback via `ConnectivityManager.registerNetworkCallback` with `NetworkCapabilities.TRANSPORT_WIFI`. The moment Wi-Fi connects, it calls `bindProcessToNetwork(wifiNetwork)`. This forces all OS TCP/UDP sockets, JNI native streams, and Tokio WebSocket connections to route through the local Wi-Fi router with zero WAN connectivity.

### 2. Host-Directed Channel Locking
* **Production Isolation**: Event organizers can now dynamically lock specific crew members to designated channels (e.g. locking a lighting technician to `Stage` or an audio engineer to `Production`).
* **Hardware Dial Constraint**: Once locked by the organizer, the crew member's phone displays a persistent amber `🔒 LOCKED BY HOST` badge, and rotary dial switching is disabled to prevent accidental channel switches.
* **Audio Privacy**: Locked members only receive audio directed to their assigned channel (or universal General broadcast). Audio on other channels is filtered out by the host server before transmission.

### 3. General Voice ("All Call" Universal Broadcast)
* **Universal Announcement Channel**: Added preset channel `ch_all` ("General (All Call)").
* **Cross-Channel Audio Distribution**: When an organizer or crew member selects "General (All Call)" and speaks, the Rust host server broadcasts the audio frames to all connected handsets across all channels simultaneously.
* **Channel-Specific Privacy Preserved**: Transmissions on specific channels (`Stage`, `Production`, `Front Desk`) remain strictly confined to members listening to those respective channels.

### 4. Push-to-Talk Floor Arbitration & "Channel Busy" Bug Fix
* **Elimination of Phantom Busy States**: Resolved an issue where pressing PTT immediately triggered a "Channel is busy" error on idle or two-device channels.
* **Root Causes Addressed**:
  1. Corrected `onSpeakerChange` to compare against the client's actual native `deviceId` rather than a hardcoded string, preventing the client from mistaking its own transmission for an unauthorized third-party speaker.
  2. Fixed `FloorStateMachine.handleFloorGrant` to validate optional request IDs without false mismatches dropping the grant back to the host.
  3. Hardened `FloorManager.release_floor` in Rust so matching device IDs unconditionally release the floor lease.

### 5. Open Source MIT Licensing
* Formally licensed under the standard MIT License with author attribution: `Anas Abubakar <anasabubakar7000@gmail.com>`.
* Updated root `LICENSE`, `modules/expo-walkie-core/LICENSE`, `package.json`, and `Cargo.toml`.

---

## 📦 Verified Installation & Sideloading

```bash
# Sideload APK directly over ADB
adb install -r walkie-pilot-v0.2.0.apk
```

Or transfer `walkie-pilot-v0.2.0.apk` to any Android device via USB/Wi-Fi and tap to install (enable "Install unknown apps" when prompted).
