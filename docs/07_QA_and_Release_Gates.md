# Walkie Talkie Test Plan and Release Gates

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Physical-device and venue verification for the Android pilot. Record actual results for every advertised configuration.

## Proposed gates

These are proposed pilot gates, not measured results.

| Measure | Proposed target and measurement |
|---|---|
| Offline setup | No WAN or cellular on test phones. A prepared crew member joins and transmits within 60 seconds of scanning the event QR |
| PTT timing | Press-to-grant chirp ≤250 ms p95 and first spoken audio to receiver ≤400 ms p95 on a healthy pilot LAN. Record each separately using a shared timing reference or synchronized capture |
| Locked operation | At least 99 of 100 receive and reply trials succeed per advertised device/configuration. Include stationary idle, screen asleep, Battery Saver, and foreground-to-lock transitions. Report failures by case |
| Recovery | Reconnect and resume listening within 5 seconds p95 once a valid network and the same host are reachable. No auto-transmit after recovery |
| Contention and isolation | All simultaneous requests permit only one speaker per channel. Unauthorized devices and other channels receive no audio. Orphaned floor clears within 2 seconds |
| Host lifecycle | With WAN unplugged, test host awake for a four-hour rehearsal, host locked separately, and recovery after process death, IP change and Wi‑Fi loss. Only advertise locked hosting after it passes on named devices |
| Crew shift | Test representative phones over a four-hour shift. Initial target ≤20 percentage points additional battery use versus a matched idle baseline, with no thermal or audio degradation |
| Venue operation | 20 phones across 3 channels during a rehearsal, clear speech at every required coverage point, documented fallback and zero unreported disconnections during sampled tests |

## Test matrix

| Area | Cases |
|---|---|
| Network | WAN unplugged, cellular disabled, captive portal, client isolation, IP changes, out-of-range, reconnect, roaming |
| Host lifecycle | Foreground, locked separately, idle, charger removed, low battery, process death, manual spare replacement |
| Crew lifecycle | Lock, long idle, Battery Saver, screen wake while locked, force-stop recovery, Android versions and vendor battery modes |
| Audio | Speaker, supported headset, noisy room, call interruption, audio focus loss, Bluetooth disconnect and concurrent channel traffic |
| Access | Invalid or expired invite, identity mismatch, revoked member, cross-channel leakage, duplicate requests and cancellation before grant |
| Performance | Cold and warm join, bursts of requests, twenty phones, multiple channels, four-hour shift, hotspot only if validated |

Every test record contains app version, handset model, OS, Wi‑Fi setup, power/display state, expected and observed behavior, timestamp and pass/fail disposition. Mark unsupported lock modes clearly. Launch only after required venue coverage is walked and outage fallback is rehearsed. Leave timing and reliability figures labeled as targets until measured.
