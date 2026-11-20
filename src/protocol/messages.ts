/**
 * Walkie - Wire Protocol Messages
 * Offline WebSocket Control & Audio Framing Specification
 */

import type { Channel } from '../types';

export const PROTOCOL_VERSION = 1;
export const AUDIO_FRAME_MAGIC = 0xa0;
export const MAX_FLOOR_DURATION_MS = 30000; // 30s floor lease cap
export const ORPHAN_LEASE_TIMEOUT_MS = 2000; // 2s orphan lease expiry

// --- Control Message Definitions ---

export interface AuthRequestMsg {
  type: 'AUTH_REQ';
  version: number;
  token: string;
  clientId: string;
  displayName: string;
  requestedChannelId: string;
}

export interface AuthResponseMsg {
  type: 'AUTH_RESP';
  success: boolean;
  reason?: string;
  eventId: string;
  eventName: string;
  channels: Channel[];
  assignedClientId: string;
  activeSpeakers: Record<string, { speakerId: string; speakerName: string }>;
}

export interface PingMsg {
  type: 'PING';
  clientTime: number;
}

export interface PongMsg {
  type: 'PONG';
  clientTime: number;
  serverTime: number;
}

export interface FloorRequestMsg {
  type: 'FLOOR_REQ';
  reqId: string;
  channelId: string;
  clientId: string;
}

export interface FloorGrantMsg {
  type: 'FLOOR_GRANT';
  reqId: string;
  channelId: string;
  leaseId: string;
  epoch: number;
  grantedTo: string;
  speakerName: string;
  maxDurationMs: number;
}

export interface FloorBusyMsg {
  type: 'FLOOR_BUSY';
  reqId: string;
  channelId: string;
  holderId: string;
  holderName: string;
}

export interface FloorReleaseMsg {
  type: 'FLOOR_RELEASE';
  channelId: string;
  leaseId: string;
  clientId: string;
}

export interface FloorRevokeMsg {
  type: 'FLOOR_REVOKE';
  channelId: string;
  leaseId: string;
  reason: 'TIMEOUT' | 'OVERTAKEN' | 'REVOKED' | 'HOST_STOPPED';
}

export interface SpeakerUpdateMsg {
  type: 'SPEAKER_UPDATE';
  channelId: string;
  speakerId: string | null;
  speakerName: string | null;
}

export interface ChannelSwitchMsg {
  type: 'CHANNEL_SWITCH';
  clientId: string;
  channelId: string;
}

export interface ChannelListUpdateMsg {
  type: 'CHANNEL_LIST_UPDATE';
  channels: Channel[];
}

export interface MemberRevokedMsg {
  type: 'MEMBER_REVOKED';
  clientId: string;
  reason: string;
}

export interface EventEndedMsg {
  type: 'EVENT_ENDED';
  reason: string;
}

export type WalkieControlMessage =
  | AuthRequestMsg
  | AuthResponseMsg
  | PingMsg
  | PongMsg
  | FloorRequestMsg
  | FloorGrantMsg
  | FloorBusyMsg
  | FloorReleaseMsg
  | FloorRevokeMsg
  | SpeakerUpdateMsg
  | ChannelSwitchMsg
  | ChannelListUpdateMsg
  | MemberRevokedMsg
  | EventEndedMsg;

// --- Binary Audio Framing Helpers ---

/**
 * 16-bit short hash for channel string to pack into binary audio header.
 */
export function hashChannelId(channelId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < channelId.length; i++) {
    hash ^= channelId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash ^ (hash >>> 16)) & 0xffff;
}

export interface AudioPacketHeader {
  magic: number; // 0xA0
  channelHash: number; // 16-bit uint
  epoch: number; // 32-bit uint
  seq: number; // 32-bit uint
  timestamp: number; // 32-bit uint
}

export const AUDIO_HEADER_SIZE = 15;

/**
 * Pack an audio payload into binary format:
 * [0]: Magic (0xA0)
 * [1-2]: ChannelHash (uint16 BE)
 * [3-6]: Epoch (uint32 BE)
 * [7-10]: Seq (uint32 BE)
 * [11-14]: Timestamp (uint32 BE)
 * [15+]: Audio data (Opus or framed PCM)
 */
export function packAudioFrame(
  channelHash: number,
  epoch: number,
  seq: number,
  timestamp: number,
  payload: Uint8Array
): Uint8Array {
  const frame = new Uint8Array(AUDIO_HEADER_SIZE + payload.length);
  frame[0] = AUDIO_FRAME_MAGIC;

  // Channel hash (16-bit BE)
  frame[1] = (channelHash >> 8) & 0xff;
  frame[2] = channelHash & 0xff;

  // Epoch (32-bit BE)
  frame[3] = (epoch >>> 24) & 0xff;
  frame[4] = (epoch >>> 16) & 0xff;
  frame[5] = (epoch >>> 8) & 0xff;
  frame[6] = epoch & 0xff;

  // Seq (32-bit BE)
  frame[7] = (seq >>> 24) & 0xff;
  frame[8] = (seq >>> 16) & 0xff;
  frame[9] = (seq >>> 8) & 0xff;
  frame[10] = seq & 0xff;

  // Timestamp (32-bit BE)
  frame[11] = (timestamp >>> 24) & 0xff;
  frame[12] = (timestamp >>> 16) & 0xff;
  frame[13] = (timestamp >>> 8) & 0xff;
  frame[14] = timestamp & 0xff;

  frame.set(payload, AUDIO_HEADER_SIZE);
  return frame;
}

/**
 * Unpack a binary audio frame header.
 */
export function unpackAudioFrame(data: Uint8Array): {
  header: AudioPacketHeader | null;
  payload: Uint8Array;
} {
  if (data.length < AUDIO_HEADER_SIZE || data[0] !== AUDIO_FRAME_MAGIC) {
    return { header: null, payload: new Uint8Array(0) };
  }

  const channelHash = (data[1] << 8) | data[2];
  const epoch =
    ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0;
  const seq =
    ((data[7] << 24) | (data[8] << 16) | (data[9] << 8) | data[10]) >>> 0;
  const timestamp =
    ((data[11] << 24) | (data[12] << 16) | (data[13] << 8) | data[14]) >>> 0;

  const header: AudioPacketHeader = {
    magic: data[0],
    channelHash,
    epoch,
    seq,
    timestamp,
  };

  const payload = data.subarray(AUDIO_HEADER_SIZE);
  return { header, payload };
}
