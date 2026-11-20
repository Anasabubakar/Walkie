# Walkie Talkie Design and Settings Specification

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Interface and behavior specification for the approved black handheld-radio design.

## Radio and settings layout

Use the approved matte-black radio face as the default screen. Keep the recessed monochrome channel display, dominant rubber-style push-to-talk control, two channel arrows and corner settings gear. Tapping the channel display can open the list directly. Long channel names truncate on the face and appear in full in the picker and accessibility labels. Avoid decorative copy or permanent navigation chrome. Respect large text, screen readers and minimum touch targets. Provide optional haptics and tones, with visible equivalents for loud or quiet venues.

The Stitch attachment shows four compact concepts that appear to cover physical radio controls, lock screen, channels and hardware/settings. At 268 × 239 pixels, individual labels cannot reliably be transcribed. The following is the proposed functional inventory.

| Area | Pilot controls | Later or conditional |
|---|---|---|
| Physical radio | Hold-to-talk, release-to-listen, current channel, connection and speaker status, channel arrows | Supported external PTT key |
| Lock screen | Enable duty mode, see current channel, hear incoming live voice on verified devices, reply without PIN on verified devices, leave duty mode | Physical hold/release when locked on certified accessories, iPhone offline lock-screen controls after entitlement and testing |
| Channels | List authorized channels, switch, see idle/busy, return to last approved channel after reconnect | Priority announcements, scanning and simultaneous monitoring after crew feedback |
| Audio and hardware | Speaker or connected headset route where supported, mic permission status, volume guidance through system controls, transmit chirp and haptics toggles, local mic/route test | Per-accessory button mappings and route-specific calibration |
| Connection and identity | QR join, manual host details, crew name, network status, reconnect, leave event, local diagnostics | Venue profiles, managed device provisioning |
| Organizer | Create event and channels, issue invite, approve or revoke devices, check host status, export redacted logs | Transfer hosting, dedicated hosts and multi-site management |

Radio states are **joining, ready, requesting, transmitting, receiving, busy, reconnecting and disconnected**. Use plain text and shape as well as tones. Grant chirp precedes speech. The screen displays the name of the current speaker, and failure is visible when nobody can hear you. Releasing before the grant cancels the request. An accessibility action and lock-screen fallback can use explicit Start and Stop instead of a hold gesture, with a visible timer and automatic cutoff.

## Screen sequence

1. First launch offers Create Event and Join Event. Ask for camera only when scanning and microphone when the user needs to transmit. Offer manual pairing when camera access is unavailable.
2. Joining shows Wi‑Fi reachability and host verification. Successful join opens the crew's authorized channels.
3. The radio face is the default view. Put event and host management behind the settings gear. A low-network state shows its cause and an actionable recovery option.
4. Leave Event and End Event are distinct actions. End Event confirms that it will disconnect the crew.

## Interaction cues

| State | Cue |
|---|---|
| Ready | Current channel and Connected status |
| Requesting | Button depresses and status indicates waiting for the channel |
| Transmitting | Grant chirp and clear transmitting status. Capture ends on release |
| Receiving | Current speaker name and listening status |
| Busy | Busy status with optional short haptic. No microphone capture |
| Disconnected | Host disconnected or Wi‑Fi unavailable, with reconnect or rescan action |

Check the main button with screen readers, larger text, reduced motion and one-handed use. Verify permission denial and recoverable empty states. Give any accessibility/lock-screen Start and Stop mode a visible timer and auto-cutoff.
