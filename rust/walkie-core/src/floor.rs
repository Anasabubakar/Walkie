//! Walkie Floor Arbitration State Machine
//! Multi-channel, deterministic floor arbitration with single active speaker per channel,
//! concurrent channel isolation, 30s lease timeout, 2s orphan audio detection, and FIFO queue.

use crate::protocol::{MAX_FLOOR_DURATION_MS, ORPHAN_LEASE_TIMEOUT_MS};
use std::collections::{HashMap, VecDeque};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FloorGrantInfo {
    pub channel_id: String,
    pub lease_id: String,
    pub speaker_id: String,
    pub speaker_name: String,
    pub epoch: u32,
    pub granted_at_ms: u64,
    pub expires_at_ms: u64,
    pub last_audio_ms: u64,
}

#[derive(Debug, Clone)]
pub struct PendingFloorRequest {
    pub req_id: String,
    pub device_id: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct ChannelFloorState {
    pub current_grant: Option<FloorGrantInfo>,
    pub queue: VecDeque<PendingFloorRequest>,
}

impl ChannelFloorState {
    pub fn new() -> Self {
        Self {
            current_grant: None,
            queue: VecDeque::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FloorRequestOutcome {
    Granted(FloorGrantInfo),
    Busy {
        speaker_id: String,
        speaker_name: String,
    },
}

#[derive(Debug, Default)]
pub struct FloorManager {
    channels: HashMap<String, ChannelFloorState>,
}

impl FloorManager {
    pub fn new() -> Self {
        Self {
            channels: HashMap::new(),
        }
    }

    pub fn get_channel_state(&mut self, channel_id: &str) -> &mut ChannelFloorState {
        self.channels
            .entry(channel_id.to_string())
            .or_insert_with(ChannelFloorState::new)
    }

    pub fn get_active_speaker(&self, channel_id: &str) -> Option<(String, String)> {
        self.channels
            .get(channel_id)
            .and_then(|ch| ch.current_grant.as_ref())
            .map(|g| (g.speaker_id.clone(), g.speaker_name.clone()))
    }

    pub fn request_floor(
        &mut self,
        channel_id: &str,
        req_id: &str,
        device_id: &str,
        display_name: &str,
        epoch: u32,
        now_ms: u64,
    ) -> FloorRequestOutcome {
        let state = self.get_channel_state(channel_id);

        if let Some(ref current) = state.current_grant {
            if current.speaker_id == device_id {
                // Device already holds floor on this channel; return existing grant
                return FloorRequestOutcome::Granted(current.clone());
            }

            // Floor is currently occupied by another speaker
            // Ensure request isn't already queued
            if !state.queue.iter().any(|req| req.device_id == device_id) {
                state.queue.push_back(PendingFloorRequest {
                    req_id: req_id.to_string(),
                    device_id: device_id.to_string(),
                    display_name: display_name.to_string(),
                });
            }

            return FloorRequestOutcome::Busy {
                speaker_id: current.speaker_id.clone(),
                speaker_name: current.speaker_name.clone(),
            };
        }

        // Channel is idle; grant floor immediately
        let lease_id = format!("lease_{}", Uuid::new_v4().simple());
        let grant = FloorGrantInfo {
            channel_id: channel_id.to_string(),
            lease_id,
            speaker_id: device_id.to_string(),
            speaker_name: display_name.to_string(),
            epoch,
            granted_at_ms: now_ms,
            expires_at_ms: now_ms + MAX_FLOOR_DURATION_MS,
            last_audio_ms: now_ms,
        };

        state.current_grant = Some(grant.clone());
        FloorRequestOutcome::Granted(grant)
    }

    /// Releases floor. Returns (was_released, next_grant_if_queued)
    pub fn release_floor(
        &mut self,
        channel_id: &str,
        lease_id: &str,
        device_id: &str,
        epoch: u32,
        now_ms: u64,
    ) -> (bool, Option<FloorGrantInfo>) {
        let state = match self.channels.get_mut(channel_id) {
            Some(s) => s,
            None => return (false, None),
        };

        let is_current = state
            .current_grant
            .as_ref()
            .map(|g| g.lease_id == lease_id && g.speaker_id == device_id)
            .unwrap_or(false);

        if !is_current {
            // Also remove from pending queue if queued
            state.queue.retain(|req| req.device_id != device_id);
            return (false, None);
        }

        // Grant is released
        state.current_grant = None;

        // Check if there is a pending request in the FIFO queue
        if let Some(next_req) = state.queue.pop_front() {
            let next_lease = format!("lease_{}", Uuid::new_v4().simple());
            let next_grant = FloorGrantInfo {
                channel_id: channel_id.to_string(),
                lease_id: next_lease,
                speaker_id: next_req.device_id,
                speaker_name: next_req.display_name,
                epoch,
                granted_at_ms: now_ms,
                expires_at_ms: now_ms + MAX_FLOOR_DURATION_MS,
                last_audio_ms: now_ms,
            };
            state.current_grant = Some(next_grant.clone());
            (true, Some(next_grant))
        } else {
            (true, None)
        }
    }

    /// Validates whether a device is currently permitted to transmit audio on a channel.
    /// If valid, updates last_audio_ms.
    pub fn on_audio_received(
        &mut self,
        channel_id: &str,
        device_id: &str,
        epoch: u32,
        now_ms: u64,
    ) -> bool {
        let state = match self.channels.get_mut(channel_id) {
            Some(s) => s,
            None => return false,
        };

        if let Some(ref mut grant) = state.current_grant {
            if grant.speaker_id == device_id && grant.epoch == epoch {
                grant.last_audio_ms = now_ms;
                return true;
            }
        }
        false
    }

    /// Checks for expired grants: max 30s floor duration or 2s orphan audio timeout.
    /// Returns list of (revoked_grant, reason, promoted_next_grant).
    pub fn check_timeouts(
        &mut self,
        now_ms: u64,
        epoch: u32,
    ) -> Vec<(FloorGrantInfo, &'static str, Option<FloorGrantInfo>)> {
        let mut expired = Vec::new();

        for (channel_id, state) in self.channels.iter_mut() {
            let mut timeout_reason = None;

            if let Some(ref grant) = state.current_grant {
                if now_ms >= grant.expires_at_ms {
                    timeout_reason = Some("LEASE_EXPIRED_MAX_DURATION");
                } else if now_ms > grant.last_audio_ms + ORPHAN_LEASE_TIMEOUT_MS {
                    timeout_reason = Some("LEASE_EXPIRED_ORPHAN_AUDIO");
                }
            }

            if let Some(reason) = timeout_reason {
                let revoked = state.current_grant.take().unwrap();
                let next_grant = if let Some(next_req) = state.queue.pop_front() {
                    let next_lease = format!("lease_{}", Uuid::new_v4().simple());
                    let g = FloorGrantInfo {
                        channel_id: channel_id.clone(),
                        lease_id: next_lease,
                        speaker_id: next_req.device_id,
                        speaker_name: next_req.display_name,
                        epoch,
                        granted_at_ms: now_ms,
                        expires_at_ms: now_ms + MAX_FLOOR_DURATION_MS,
                        last_audio_ms: now_ms,
                    };
                    state.current_grant = Some(g.clone());
                    Some(g)
                } else {
                    None
                };

                expired.push((revoked, reason, next_grant));
            }
        }

        expired
    }

    /// Handles device disconnection or channel leaving.
    /// Releases active grant and clears from pending queues.
    pub fn remove_device(
        &mut self,
        device_id: &str,
        epoch: u32,
        now_ms: u64,
    ) -> Vec<(String, FloorGrantInfo, Option<FloorGrantInfo>)> {
        let mut vacated = Vec::new();

        for (channel_id, state) in self.channels.iter_mut() {
            state.queue.retain(|req| req.device_id != device_id);

            let is_speaker = state
                .current_grant
                .as_ref()
                .map(|g| g.speaker_id == device_id)
                .unwrap_or(false);

            if is_speaker {
                let revoked = state.current_grant.take().unwrap();
                let next_grant = if let Some(next_req) = state.queue.pop_front() {
                    let next_lease = format!("lease_{}", Uuid::new_v4().simple());
                    let g = FloorGrantInfo {
                        channel_id: channel_id.clone(),
                        lease_id: next_lease,
                        speaker_id: next_req.device_id,
                        speaker_name: next_req.display_name,
                        epoch,
                        granted_at_ms: now_ms,
                        expires_at_ms: now_ms + MAX_FLOOR_DURATION_MS,
                        last_audio_ms: now_ms,
                    };
                    state.current_grant = Some(g.clone());
                    Some(g)
                } else {
                    None
                };

                vacated.push((channel_id.clone(), revoked, next_grant));
            }
        }

        vacated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_grant_and_release() {
        let mut fm = FloorManager::new();
        let now = 1000;

        let res = fm.request_floor("ch_stage", "r1", "dev1", "Alice", 1, now);
        let grant = match res {
            FloorRequestOutcome::Granted(g) => g,
            _ => panic!("Expected grant"),
        };
        assert_eq!(grant.speaker_id, "dev1");
        assert_eq!(grant.channel_id, "ch_stage");
        assert_eq!(grant.expires_at_ms, now + 30000);

        // Audio validation
        assert!(fm.on_audio_received("ch_stage", "dev1", 1, now + 100));
        assert!(!fm.on_audio_received("ch_stage", "dev2", 1, now + 100)); // dev2 has no floor

        // Second device requests while floor is busy
        let res2 = fm.request_floor("ch_stage", "r2", "dev2", "Bob", 1, now + 200);
        match res2 {
            FloorRequestOutcome::Busy { speaker_id, .. } => assert_eq!(speaker_id, "dev1"),
            _ => panic!("Expected busy"),
        }

        // Independent channel can grant concurrently
        let res_prod = fm.request_floor("ch_prod", "r3", "dev3", "Charlie", 1, now + 300);
        assert!(matches!(res_prod, FloorRequestOutcome::Granted(_)));

        // Release stage floor: dev2 should be promoted automatically from queue
        let (released, next_grant) = fm.release_floor("ch_stage", &grant.lease_id, "dev1", 1, now + 400);
        assert!(released);
        let promoted = next_grant.expect("dev2 should be promoted");
        assert_eq!(promoted.speaker_id, "dev2");
        assert_eq!(promoted.speaker_name, "Bob");
    }

    #[test]
    fn test_orphan_timeout() {
        let mut fm = FloorManager::new();
        let now = 10_000;

        fm.request_floor("ch_stage", "r1", "dev1", "Alice", 1, now);
        // Dev1 speaks at now + 500
        fm.on_audio_received("ch_stage", "dev1", 1, now + 500);

        // At now + 2000, not orphan yet (last audio was 10500, diff is 1500 < 2000)
        let timeouts = fm.check_timeouts(now + 2000, 1);
        assert!(timeouts.is_empty());

        // At now + 2600 (diff is 2100 > 2000), orphan timeout kicks in!
        let timeouts = fm.check_timeouts(now + 2601, 1);
        assert_eq!(timeouts.len(), 1);
        assert_eq!(timeouts[0].1, "LEASE_EXPIRED_ORPHAN_AUDIO");
        assert_eq!(timeouts[0].0.speaker_id, "dev1");
    }

    #[test]
    fn test_max_duration_timeout() {
        let mut fm = FloorManager::new();
        let now = 10_000;

        fm.request_floor("ch_stage", "r1", "dev1", "Alice", 1, now);
        // Continuously sending audio
        fm.on_audio_received("ch_stage", "dev1", 1, now + 29_000);

        // Under 30s
        assert!(fm.check_timeouts(now + 29_500, 1).is_empty());

        // At 30s exactly
        let timeouts = fm.check_timeouts(now + 30_000, 1);
        assert_eq!(timeouts.len(), 1);
        assert_eq!(timeouts[0].1, "LEASE_EXPIRED_MAX_DURATION");
    }
}
