# Walkie Talkie Implementation Plan

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Work sequence, dependencies and release evidence for the Android-first pilot.

## Build sequence

| Phase | Work | Exit evidence |
|---|---|---|
| 0 · Feasibility, week 1 | Two Android phones, one hosting over Wi‑Fi with WAN disconnected. Spike embedded audio relay and test the crew device locked first. Test the host locked separately. Start Apple entitlement request and gather higher-resolution Stitch screens if available | Timestamped test log and recording of receive and reply with phones locked or documented limits by device |
| 1 · Vertical slice, weeks 2–3 | QR and manual join, single channel then multiple channels, authorization, floor arbitration, reconnect, approved radio UI and permission flows | Two devices pass join, hold/release, contention, loss of connection, cross-channel isolation, same-host restart and rejoin |
| 2 · Pilot preparation, weeks 4–5 | Channel admin, device revocation, diagnostics, accessibility, speaker/headset routing, failure drills, brief crew guide | 10–20 devices through a rehearsal with no WAN, a verified device list and a complete runbook |
| 3 · Venue pilot, week 6 | One rehearsal and one event, one operator, tracked fallback incidents, crew debrief | Actual range map, setup duration, audio delivery results, battery data, field issues and clear repeat-pilot decision |
| Parallel iOS track | Swift/SwiftUI foreground client, Apple PTT and Local Push Connectivity integration once authorized | Separate matrix for foreground, locked receive and locked reply |

Estimates assume one Android engineer, one networking/media engineer and available venue testing support. They are sequencing assumptions, especially where OS behavior or entitlements are involved. A single engineer should preserve the gates and expect a longer schedule.

**Initial engineering backlog.** Build a LAN echo/latency spike on physical Android phones. Add Create Event, authenticated QR onboarding and network preflight. Implement group media and floor arbitration. Add crew duty mode and the approved radio UI. Implement host recovery, organizer controls and diagnostics. Run staged load and venue coverage tests. One repo can hold the Android app, embedded relay, shared protocol and operations documentation. Set up CI for Kotlin and relay builds, plus protocol and floor-state tests. Run real-device regression tests for lock state, gesture release, audio focus, thermal load and Wi‑Fi loss.

## Workstream ownership

| Workstream | Owner | Evidence |
|---|---|---|
| Host and protocol | Networking engineer | Offline session and arbitration tests, restart and stale-epoch handling |
| Android audio and duty mode | Android engineer | Verified hardware matrix and permission/focus transitions |
| Radio and settings | Android engineer with design review | Approved faceplate and accessibility walkthrough |
| Release and rehearsal | Organizer and QA | Signed builds, install instructions, coverage map, recovery drill and go/no-go log |

## First engineering slice

1. Put two physical Android phones on the same router with WAN and cellular disabled. Confirm bidirectional LAN reachability.
2. Run the same app on both phones. Create Event on one and join from the other. Establish live voice and basic press/release.
3. Lock only the crew phone and test receive and reply after idle. Record OS, model, battery settings, control used and failures.
4. Repeat with the organizer phone locked. Keep the first pilot host awake until that path is verified.
5. Test same-host restart, IP change, and an unavailable host. Confirm crew resumes listening only after valid recovery.

## Release artifacts

Build checks, signed Android pilot build, installation guide, supported-device list, operator runbook, protocol version notes, test evidence and known limitations. Rehearse fallback before live use.
