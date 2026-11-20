# Walkie Talkie Product PRD

20 November 2026 · Draft 1 · Android-first, phone-hosted pilot

Product direction for the founder, designers and pilot organizers. The organizer’s Android phone hosts the event over shared Wi‑Fi.

## Product direction

Give event crews and building teams a shared radio they can run on their own Wi‑Fi without mobile data, internet or a cloud login. The organizer taps **Create Event**. Their Android phone hosts every channel on the shared Wi‑Fi, and crew members scan its invite QR code. A standard router supplies the network. The everyday workflow is **join venue → choose channel → hold to speak → release to listen**. An active duty session should keep receiving when the handset locks, with a clearly supported way to reply without unlocking. The handset must remain powered on.

Start with a single hall and backstage area, one organizer and 10–20 crew members. Good first users are stage managers, production assistants and front-of-house teams. The organizer needs quick provisioning and a way to see whether the system is usable. Crew members need intelligible speech, unmistakable connection status and controls they can operate one-handed. For the pilot, keep the existing radio or an agreed runner fallback available and assign a person to call the switch if coverage fails.

**Pilot scope:** one organizer phone on shared Wi‑Fi, three preset channels (Stage, Production, Front Desk), one active channel per phone, multiple independent channels in use at once, live one-speaker-at-a-time audio, local administration, and supported Android lock-screen controls. No cloud dependency in runtime. Install the app on crew phones before arriving. A building deployment adds mapped coverage, site-owned network access and operating procedures after the event pilot proves the workflow.

## Jobs to be done

- A stage manager wants to cue a crew member without typing or calling.
- A roaming volunteer wants to hear the next call with the phone in their pocket and reply without entering a PIN.
- An organizer wants to start a private crew event with the Wi‑Fi and phones already on site.

## Priorities and success

P0 covers creating and joining an event, live channel audio, reliable talk contention, clear connection states and verified crew lock-screen operation. P1 adds tested locked hosting, better venue profiles and validated accessory support. Later work includes explicit host transfer, dedicated host deployments and iPhone release after platform validation.

Pilot with one venue, three channels and 10–20 crew members. Measure onboarding time, understood instructions, missed calls, fallback use and willingness to reuse. Targets are proposed. See the test plan for engineering gates. Product review decides whether to expand only after rehearsal and crew debrief.

## Commercial hypothesis

Small events may bring their own router and use an organizer phone. Test whether crews will pay for organizer setup and support. Buildings may prefer a dedicated installation and a coverage survey. Use pilot operating costs before setting prices.

## Questions for the pilot

- Which phone brands and OS versions do the first crews actually bring?
- Which organizer phones can sustain a full shift with 20 crew members, and which can host safely through lock and idle?
- Does a long-idle Android receive and respond reliably using venue Wi-Fi only on those devices?
- Can the iOS entitlement cover the intended venue network and distribution model?
- Which required spots have weak coverage when the venue is full?
- Do crews prefer a lock-screen control or a tested headset PTT button when moving?
- Which Stitch controls belong in the first settings screen once their original labels are readable?
