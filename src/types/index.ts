/**
 * Walkie - Type Definitions
 * Zero-WAN local push-to-talk system for event crews.
 */

export type WalkieRole = 'organizer' | 'crew';

export type FloorState =
  | 'IDLE'          // Listening to channel, floor is open
  | 'REQUESTING'    // PTT held down, waiting for grant from host
  | 'TRANSMITTING'  // Speaking grant acquired, microphone active
  | 'BUSY'          // Another participant holds the channel
  | 'DISCONNECTED'; // Host unreachable, audio suspended

export type ConnectionState =
  | 'OFFLINE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'HOST_STOPPED';

export interface Channel {
  id: string;
  name: string;
  isPreset?: boolean;
}

export interface ActiveSpeaker {
  channelId: string;
  speakerId: string;
  speakerName: string;
  startedAt: number;
}

export interface EventConfig {
  eventId: string;
  name: string;
  hostEndpoint: string;       // e.g. "192.168.1.100:8443"
  hostFingerprint: string;    // SHA-256 fingerprint of host's TLS identity
  admissionToken: string;     // Expiring HMAC token
  channels: Channel[];
}

export interface ConnectedMember {
  id: string;
  displayName: string;
  channelId: string;
  connectedAt: number;
  ipAddress: string;
  isRevoked: boolean;
  lastPingAt: number;
}

export type AudioRoute = 'SPEAKER' | 'EARPIECE' | 'BLUETOOTH';

export type AccessibilityPttMode = 'HOLD' | 'TAP_TOGGLE';

export interface AudioSettings {
  route: AudioRoute;
  chirpsEnabled: boolean;
  hapticsEnabled: boolean;
  accessibilityPttMode: AccessibilityPttMode;
  autoCutoffSeconds: number; // default 30
}

export interface NetworkDiagnostics {
  localIp: string;
  hostEndpoint: string;
  rttMs: number;
  packetLossRate: number; // 0.0 - 1.0
  packetsSent: number;
  packetsReceived: number;
  jitterMs: number;
  lastGrantLatencyMs: number;
}
