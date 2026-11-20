//! Walkie Wire Protocol & Binary Framing

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const AUDIO_FRAME_MAGIC: u8 = 0xa0;
pub const AUDIO_HEADER_SIZE: usize = 15;
pub const MAX_FLOOR_DURATION_MS: u64 = 30000;
pub const ORPHAN_LEASE_TIMEOUT_MS: u64 = 2000;
pub const ALL_CALL_CHANNEL_ID: &str = "ch_all";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioPacketHeader {
    pub magic: u8,
    pub channel_hash: u16,
    pub epoch: u32,
    pub seq: u32,
    pub timestamp: u32,
}

pub fn hash_channel_id(channel_id: &str) -> u16 {
    let mut hash: u32 = 0x811c_9dc5;
    for code_unit in channel_id.encode_utf16() {
        hash ^= code_unit as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    ((hash ^ (hash >> 16)) & 0xffff) as u16
}

pub fn pack_audio_frame(
    channel_hash: u16,
    epoch: u32,
    seq: u32,
    timestamp: u32,
    payload: &[u8],
) -> Vec<u8> {
    let mut frame = Vec::with_capacity(AUDIO_HEADER_SIZE + payload.len());
    frame.push(AUDIO_FRAME_MAGIC);

    frame.push(((channel_hash >> 8) & 0xff) as u8);
    frame.push((channel_hash & 0xff) as u8);

    frame.push(((epoch >> 24) & 0xff) as u8);
    frame.push(((epoch >> 16) & 0xff) as u8);
    frame.push(((epoch >> 8) & 0xff) as u8);
    frame.push((epoch & 0xff) as u8);

    frame.push(((seq >> 24) & 0xff) as u8);
    frame.push(((seq >> 16) & 0xff) as u8);
    frame.push(((seq >> 8) & 0xff) as u8);
    frame.push((seq & 0xff) as u8);

    frame.push(((timestamp >> 24) & 0xff) as u8);
    frame.push(((timestamp >> 16) & 0xff) as u8);
    frame.push(((timestamp >> 8) & 0xff) as u8);
    frame.push((timestamp & 0xff) as u8);

    frame.extend_from_slice(payload);
    frame
}

pub fn unpack_audio_frame(data: &[u8]) -> Option<(AudioPacketHeader, &[u8])> {
    if data.len() < AUDIO_HEADER_SIZE || data[0] != AUDIO_FRAME_MAGIC {
        return None;
    }

    let channel_hash = ((data[1] as u16) << 8) | (data[2] as u16);
    let epoch = ((data[3] as u32) << 24)
        | ((data[4] as u32) << 16)
        | ((data[5] as u32) << 8)
        | (data[6] as u32);
    let seq = ((data[7] as u32) << 24)
        | ((data[8] as u32) << 16)
        | ((data[9] as u32) << 8)
        | (data[10] as u32);
    let timestamp = ((data[11] as u32) << 24)
        | ((data[12] as u32) << 16)
        | ((data[13] as u32) << 8)
        | (data[14] as u32);

    let header = AudioPacketHeader {
        magic: data[0],
        channel_hash,
        epoch,
        seq,
        timestamp,
    };

    Some((header, &data[AUDIO_HEADER_SIZE..]))
}

// Control Messages

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_preset: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ControlMessage {
    #[serde(rename = "AUTH_REQ")]
    AuthRequest {
        version: u32,
        event_id: String,
        admission_token: String,
        device_id: String,
        display_name: String,
        channel_id: String,
    },
    #[serde(rename = "AUTH_RESP")]
    AuthResponse {
        success: bool,
        error: Option<String>,
        channels: Vec<ChannelInfo>,
        current_epoch: u32,
    },
    #[serde(rename = "FLOOR_REQ")]
    FloorRequest {
        channel_id: String,
        req_id: String,
        device_id: String,
    },
    #[serde(rename = "FLOOR_GRANT")]
    FloorGrant {
        channel_id: String,
        lease_id: String,
        speaker_id: String,
        speaker_name: String,
        epoch: u32,
        expires_at: u64,
    },
    #[serde(rename = "FLOOR_BUSY")]
    FloorBusy {
        channel_id: String,
        speaker_id: String,
        speaker_name: String,
    },
    #[serde(rename = "FLOOR_REL")]
    FloorRelease {
        channel_id: String,
        lease_id: String,
        device_id: String,
    },
    #[serde(rename = "FLOOR_REVOKE")]
    FloorRevoke {
        channel_id: String,
        lease_id: String,
        reason: String,
    },
    #[serde(rename = "FLOOR_IDLE")]
    FloorIdle {
        channel_id: String,
    },
    #[serde(rename = "CHANNEL_SWITCH")]
    ChannelSwitch {
        channel_id: String,
        device_id: String,
    },
    #[serde(rename = "LOCK_CHANNEL_REQ")]
    LockChannelRequest {
        target_device_id: String,
        channel_id: Option<String>,
    },
    #[serde(rename = "CHANNEL_LOCKED")]
    ChannelLocked {
        channel_id: String,
        channel_name: String,
        locked: bool,
    },
    #[serde(rename = "MEMBER_JOINED")]
    MemberJoined {
        device_id: String,
        display_name: String,
        channel_id: String,
    },
    #[serde(rename = "MEMBER_LEFT")]
    MemberLeft {
        device_id: String,
    },
    #[serde(rename = "PING")]
    Ping {
        timestamp: u64,
    },
    #[serde(rename = "PONG")]
    Pong {
        timestamp: u64,
    },
    #[serde(rename = "HOST_STOPPED")]
    HostStopped {
        reason: String,
    },
}
