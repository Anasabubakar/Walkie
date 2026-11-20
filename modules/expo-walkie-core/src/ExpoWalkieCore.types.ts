export interface ChannelPayload {
  id: string;
  name: string;
  isPreset?: boolean;
}

export interface EventConfigPayload {
  eventId: string;
  name: string;
  hostEndpoint: string;
  hostFingerprint: string;
  admissionToken: string;
  channels: ChannelPayload[];
}

export interface DiagnosticsPayload {
  localIp: string;
  hostEndpoint: string;
  rttMs: number;
  packetsSent: number;
  packetsReceived: number;
  packetLossRate: number;
  jitterMs: number;
  lastGrantLatencyMs: number;
}

export type FloorStateNative = 'IDLE' | 'REQUESTING' | 'TRANSMITTING' | 'BUSY' | 'DISCONNECTED';

export interface StateChangeEvent {
  state: string;
  channelId: string;
}

export interface FloorChangeEvent {
  floorState: FloorStateNative;
  channelId: string;
  leaseId?: string;
  holderName?: string;
}

export interface SpeakerChangeEvent {
  channelId: string;
  speakerId: string | null;
  speakerName: string | null;
}

export interface ChannelListUpdateEvent {
  channels: ChannelPayload[];
}

export interface NetworkStatusUpdateEvent {
  connected: boolean;
  eventName?: string;
  reason?: string;
  revoked?: boolean;
}

export interface MemberUpdateEvent {
  connectedCount: number;
}

export interface ChannelLockedEvent {
  channelId: string;
  channelName: string;
  locked: boolean;
}

export interface ConnectedMemberPayload {
  deviceId: string;
  displayName: string;
  channelId: string;
  lockedChannel?: string | null;
  role?: string;
}
