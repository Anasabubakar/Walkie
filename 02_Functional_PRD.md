# Walkie Talkie Functional PRD

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Plain-language requirements and acceptance cases for the organizer and crew experience.

## Core journey

Organizer joins Wi‑Fi → creates event → shares QR. Crew joins the same Wi‑Fi → scans QR → chooses a channel → holds to speak → releases to listen.

| ID | Requirement | Acceptance case |
|---|---|---|
| FR-01 | Create a local event | Organizer can create named channels and show a valid QR with internet and mobile data disabled |
| FR-02 | Join and authenticate | An authorized Android phone on reachable Wi‑Fi can join with the QR or verified manual details. An expired invite or mismatched host identity fails with a clear message |
| FR-03 | Choose a channel | Channel list shows authorized channels. Switching stops old-channel audio and updates the radio display |
| FR-04 | Talk and listen | Hold requests the channel. Grant triggers a chirp. Release or gesture cancellation stops capture. Other selected-channel listeners hear speech live |
| FR-05 | Handle contention | A second speaker sees Busy. Release before grant leaves the mic closed. Other channels can talk independently |
| FR-06 | Use while locked | Verified crew phones can receive and reply after idle without unlocking. Verify hold/release or the supported Start/Stop fallback per device |
| FR-07 | Recover | Host loss is visible. Returning to the same host restores authorized listening with no automatic transmission |
| FR-08 | Use settings | Audio route, chirps, haptics and connection status are discoverable from the gear. Mic test stays local |
| FR-09 | Manage access | Organizer can expire invites, revoke a connected device and end the event. Ending closes sessions |
| FR-10 | Replace a failed host | Spare phone can create a new event. Crew rejoins via its QR. The organizer has a documented interim comms method |

## Boundaries

The pilot uses a plugged-in organizer phone with its hosting screen open. Locked hosting is a separate verification gate. A powered-off phone cannot participate. Crew lock-screen support varies by device and configuration. Event voice is live and is retained nowhere by default.
