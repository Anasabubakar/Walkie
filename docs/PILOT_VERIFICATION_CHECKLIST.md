# Walkie Pilot Verification Checklist & Field Test Protocol

This checklist governs device-level QA, pilot deployment, and venue verification for **Walkie** (Android-first, phone-hosted offline PTT system).

---

## 1. Prerequisites & Binary Artifacts

- **Production APK Binary**: `android/app/build/outputs/apk/debug/app-debug.apk` (183 MB)
  - Bundled Native Architectures: `arm64-v8a`, `armeabi-v7a`, `x86_64`
  - Engine: Rust `libwalkie_core.so` (Tokio, zero-transcoding binary audio relay)
  - Native Duty Service: `WalkieDutyService` (Foreground service type: `microphone`, Wi-Fi & Wake Locks)
  - Brand Assets: Approved "Side Key" adaptive icons, monochrome launcher layer, `ic_stat_walkie.xml` notification icon.

### Sideloading Command
Connect test phones via USB with Developer Options and USB Debugging enabled:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
Confirm successful install:
```bash
adb shell pm list packages | grep expo.modules.walkiecore
```

---

## 2. Laboratory Verification Matrix (Offline Wi-Fi, No WAN)

| Test ID | Gate / Requirement | Verification Procedure | Expected Outcome | Status |
|---|---|---|---|---|
| **OFF-01** | Zero-WAN Operation | Unplug router WAN/uplink cable. Disable cellular data on all handsets. Connect Host + 2 Clients to Wi-Fi SSID. | Host starts WebSocket server on `:8443`. QR encodes local LAN IP. Clients join without WAN DNS. | Verified in Unit/Integration Tests; Field Check on Device |
| **AUTH-01** | HMAC Admission | Generate QR invite with HMAC token. Scan with Client A; attempt manual join with invalid token on Client B. | Client A successfully connects. Client B rejected with `AUTH_FAILED`. | Verified (Rust `security.rs` + Integration Test) |
| **FLOOR-01** | Single Speaker Invariant | Handset 1 requests floor on Stage channel. Handset 2 simultaneously presses PTT on Stage channel. | Handset 1 receives `GRANT` (chirp sounds, green UI). Handset 2 receives `BUSY` (red UI, speaker name displayed). | Verified (Rust `floor.rs` + Integration Test) |
| **FLOOR-02** | Contention & FIFO Promotion | Client 1 holds floor. Client 2 queues. Client 1 releases. | Client 1 floor releases. Floor is automatically granted to Client 2 within ≤50ms. | Verified (Rust `floor.rs` + Integration Test) |
| **FLOOR-03** | Max Duration Cutoff | Hold PTT continuously for >30 seconds. | Rust engine automatically revokes floor at 30.0s (`REVOKED: MAX_DURATION_EXCEEDED`). | Verified (Rust `floor.rs` test `test_max_duration_timeout`) |
| **FLOOR-04** | Orphan Cleanup | Terminate Client 1 process abruptly while holding PTT. | Engine detects frame silence >2.0s or TCP disconnect, revoking floor and notifying channel within 2s. | Verified (Rust `floor.rs` test `test_orphan_timeout`) |
| **AUDIO-01** | Zero-Transcode Latency | Stream 20ms audio frames across LAN between Host and Clients. Measure transit via Perfetto trace. | Total audio transit latency ≤40ms (well below 200ms ceiling). | Verified in Protocol Engine; trace instructions in `docs/PERFETTO_PROFILING.md` |
| **CHAN-01** | Channel Isolation | Host transmits on "Production". Client A listens on "Production". Client B listens on "Stage". | Client A receives clean audio. Client B receives 0 packets and hears complete silence. | Verified (Rust `server.rs` channel hashing filter) |
| **REVOKE-01**| Device Revocation | Organizer taps Revoke Device in Host settings for Client A. | Rust host adds device to revoked set, terminates connection, and permanently rejects reconnects. | Verified (Rust `tests/integration.rs`) |
| **LOCK-01** | Locked Screen Receive | Put Client handset to sleep (screen off). Transmit audio from Host. | Foreground `WalkieDutyService` maintains Wi-Fi & partial wake lock; `AudioTrack` plays speech clearly through speaker/headset. | Pending Physical Device Field Test |
| **LOCK-02** | Notification PTT Action | While phone is locked, use notification action / side key to respond. | Floor requested, chirp plays, speech streams without requiring device unlock. | Pending Physical Device Field Test |

---

## 3. Venue Pilot Execution Steps (Organizer & Crew Lead)

### Pre-Event Setup (60 Minutes Before Doors)
1. **Network Provisioning**:
   - Power on the venue Wi-Fi access point (e.g., standard Wi-Fi 6 router).
   - Ensure Client Isolation / AP Isolation is **DISABLED** so clients can connect directly to the organizer's IP on port 8443.
   - Unplug WAN cable to ensure 100% offline autonomy.
2. **Host Initialization**:
   - Connect Organizer phone to continuous power/charger.
   - Open Walkie -> Tap **Create Event**.
   - Confirm channels: `Stage`, `Production`, `Front Desk`.
   - Display Host Invite QR Code.
3. **Crew Onboarding**:
   - Connect crew phones to the venue Wi-Fi.
   - Open Walkie -> Tap **Join Event** -> Scan Host QR.
   - Enter display name and select assigned channel.
4. **Range Walk**:
   - Station a listener at each perimeter zone (Backstage, Stage, Front of House, Box Office).
   - Transmit a 5-second radio check count ("1, 2, 3, 4, 5 radio check") on each channel.

---

## 4. Troubleshooting & Fallback Protocol

| Symptom | Probable Cause | Action |
|---|---|---|
| Client scan fails to connect | AP Isolation is active on router; host IP unreachable | Open router admin page -> Disable "AP Isolation" / "Client Isolation" -> Re-verify ping. |
| Client disconnects on screen sleep | Aggressive vendor battery optimization (Samsung/Xiaomi) | Go to Android Settings -> Apps -> Walkie -> Battery -> Set to **Unrestricted**. |
| Audio stutter or high packet drop | Excessive 2.4GHz RF congestion | Switch router to 5GHz 802.11ac/ax dedicated SSID for event crew. |
| Host phone runs hot or battery drains | Long transmission cycles | Keep Host on AC power; ensure screen dimming is enabled while duty service runs. |
