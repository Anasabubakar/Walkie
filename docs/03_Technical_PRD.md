# Walkie Talkie Technical PRD

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Engineering requirements for a local Android host, authenticated crew clients and reliable live voice.

## Runtime requirements

- Modes are organizer host and crew client. The organizer can also talk on a channel using normal arbitration.
- All runtime signaling, authentication and audio must work without internet or mobile data. Validate on a WAN-disconnected router.
- Host assigns one speaking lease per channel. Only authorized and current-epoch media can be delivered. Drop stale frames on change or rejoin.
- Force listen-only on reconnect, process restart and grant loss. Close the mic on release, cancellation, timeout, focus loss or leave. Late grants may never reopen the mic after release.
- QR onboarding verifies a pinned identity before sending the admission token. Separate host controls, crew privileges and diagnostics. Keep credentials, voice and personally identifying data out of routine exported logs.

## Protocol and failure semantics

| Event | Required result |
|---|---|
| Join or renew | Validate event, token or membership, version and current host identity |
| Request talk | Idempotent request scoped to session and selected channel. Return granted, busy or rejected |
| Release or cancel | Stop capture locally, revoke matching lease and ignore stale or repeated requests |
| Lost socket or orphan lease | Stop forwarding after expiry. Show disconnection and require a fresh press after recovery |
| Process restart | Reuse persisted host identity and membership. Discard all old leases and start a new session epoch |
| Revoke or end event | Close affected sessions, active capture and forwarding. Reject revoked clients on reconnect |

## Proposed acceptance targets

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

## Architecture and references

See the Architecture and Technical Tradeoffs document for the relay candidate, platform constraints and operational alternatives.

- [Apple · Creating a Push to Talk app](https://developer.apple.com/documentation/pushtotalk/creating-a-push-to-talk-app)
- [Apple · Local Push Connectivity and entitlement](https://developer.apple.com/documentation/networkextension/local-push-connectivity)
- [Android · Foreground service background restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android · Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- [Android · Network service discovery](https://developer.android.com/develop/connectivity/wifi/use-nsd)
- [Android · Local network permission](https://developer.android.com/privacy-and-security/local-network-permission)
