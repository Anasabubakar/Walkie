//! Walkie Client Engine & Local Floor State Machine
//! Enforces floor invariants (release-before-grant drops grant and never transmits,
//! listen-only reset on reconnect, and ultra-low latency Opus packet dispatch).

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;

use crate::protocol::{
    hash_channel_id, pack_audio_frame, unpack_audio_frame, ChannelInfo, ALL_CALL_CHANNEL_ID,
    AUDIO_FRAME_MAGIC,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClientFloorState {
    Idle,
    Requesting { req_id: String },
    Transmitting { lease_id: String, epoch: u32 },
    Busy { holder_name: String },
    Disconnected,
}

pub struct Diagnostics {
    pub rtt_ms: u64,
    pub jitter_ms: f64,
    pub packets_sent: u64,
    pub packets_received: u64,
}

pub trait ClientCallbacks: Send + Sync {
    fn on_connected(&self, event_id: &str, event_name: &str, channels: &[ChannelInfo], epoch: u32);
    fn on_disconnected(&self, reason: &str);
    fn on_floor_granted(&self, req_id: &str, channel_id: &str, lease_id: &str, epoch: u32);
    fn on_floor_busy(&self, channel_id: &str, holder_name: &str);
    fn on_floor_revoked(&self, channel_id: &str, lease_id: &str, reason: &str);
    fn on_speaker_changed(&self, channel_id: &str, speaker_id: Option<&str>, speaker_name: Option<&str>);
    fn on_channel_locked(&self, channel_id: &str, channel_name: &str, locked: bool);
    fn on_incoming_audio_frame(&self, frame: &[u8]);
    fn on_diagnostics(&self, diag: Diagnostics);
}

pub struct WalkieClient {
    server_url: String,
    token: String,
    device_id: String,
    display_name: String,
    current_channel_id: Arc<RwLock<String>>,
    current_channel_hash: Arc<RwLock<u16>>,
    current_epoch: Arc<AtomicU32>,
    floor_state: Arc<RwLock<ClientFloorState>>,
    canceled_req_id: Arc<RwLock<Option<String>>>,
    callbacks: Arc<dyn ClientCallbacks>,

    tx_ws: Arc<Mutex<Option<mpsc::UnboundedSender<Message>>>>,
    is_connected: Arc<AtomicBool>,
    is_channel_locked: Arc<AtomicBool>,
    seq_number: Arc<AtomicU32>,

    packets_sent: Arc<AtomicU64>,
    packets_recv: Arc<AtomicU64>,
    avg_rtt_ms: Arc<AtomicU64>,
}

impl WalkieClient {
    pub fn new(
        server_url: String,
        token: String,
        device_id: String,
        display_name: String,
        initial_channel_id: String,
        callbacks: Arc<dyn ClientCallbacks>,
    ) -> Self {
        let ch_hash = hash_channel_id(&initial_channel_id);

        Self {
            server_url,
            token,
            device_id,
            display_name,
            current_channel_id: Arc::new(RwLock::new(initial_channel_id)),
            current_channel_hash: Arc::new(RwLock::new(ch_hash)),
            current_epoch: Arc::new(AtomicU32::new(1)),
            floor_state: Arc::new(RwLock::new(ClientFloorState::Disconnected)),
            canceled_req_id: Arc::new(RwLock::new(None)),
            callbacks,
            tx_ws: Arc::new(Mutex::new(None)),
            is_connected: Arc::new(AtomicBool::new(false)),
            is_channel_locked: Arc::new(AtomicBool::new(false)),
            seq_number: Arc::new(AtomicU32::new(0)),
            packets_sent: Arc::new(AtomicU64::new(0)),
            packets_recv: Arc::new(AtomicU64::new(0)),
            avg_rtt_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn is_locked(&self) -> bool {
        self.is_channel_locked.load(Ordering::SeqCst)
    }

    pub async fn current_channel_id(&self) -> String {
        self.current_channel_id.read().await.clone()
    }

    pub async fn connect(&self) -> Result<(), String> {
        let url = if self.server_url.starts_with("ws://") || self.server_url.starts_with("wss://") {
            self.server_url.clone()
        } else {
            format!("ws://{}", self.server_url)
        };

        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| format!("WebSocket connection failed to {}: {}", url, e))?;

        let (mut ws_sink, mut ws_stream) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

        {
            let mut tx_lock = self.tx_ws.lock().await;
            *tx_lock = Some(tx.clone());
        }

        // Spawn writer
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sink.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Send AUTH_REQ
        let initial_ch = self.current_channel_id.read().await.clone();
        let auth_req = json!({
            "type": "AUTH_REQ",
            "version": 1,
            "event_id": "",
            "admission_token": self.token,
            "device_id": self.device_id,
            "display_name": self.display_name,
            "channel_id": initial_ch
        }).to_string();

        let _ = tx.send(Message::text(auth_req));

        self.is_connected.store(true, Ordering::SeqCst);
        // Reset to Idle (listen-only) on connect/reconnect
        {
            let mut state = self.floor_state.write().await;
            *state = ClientFloorState::Idle;
        }

        let callbacks = Arc::clone(&self.callbacks);
        let floor_state = Arc::clone(&self.floor_state);
        let canceled_req_id = Arc::clone(&self.canceled_req_id);
        let current_channel_hash = Arc::clone(&self.current_channel_hash);
        let current_channel_id = Arc::clone(&self.current_channel_id);
        let is_channel_locked = Arc::clone(&self.is_channel_locked);
        let current_epoch = Arc::clone(&self.current_epoch);
        let packets_recv = Arc::clone(&self.packets_recv);
        let avg_rtt_ms = Arc::clone(&self.avg_rtt_ms);
        let is_connected = Arc::clone(&self.is_connected);
        let device_id = self.device_id.clone();
        let tx_ws_clone = Arc::clone(&self.tx_ws);

        // Ping loop
        let tx_ping = tx.clone();
        let is_connected_ping = Arc::clone(&self.is_connected);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(2));
            while is_connected_ping.load(Ordering::SeqCst) {
                interval.tick().await;
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                let ping = json!({
                    "type": "PING",
                    "timestamp": now_ms
                }).to_string();
                if tx_ping.send(Message::text(ping)).is_err() {
                    break;
                }
            }
        });

        // Main reader loop
        tokio::spawn(async move {
            let all_call_hash = hash_channel_id(ALL_CALL_CHANNEL_ID);

            while let Some(Ok(msg)) = ws_stream.next().await {
                match msg {
                    Message::Binary(bin_data) => {
                        let current_ch_hash = *current_channel_hash.read().await;
                        let ep = current_epoch.load(Ordering::SeqCst);

                        if let Some((header, _)) = unpack_audio_frame(&bin_data) {
                            if header.magic == AUDIO_FRAME_MAGIC
                                && (header.channel_hash == current_ch_hash || header.channel_hash == all_call_hash)
                                && header.epoch == ep
                            {
                                packets_recv.fetch_add(1, Ordering::SeqCst);
                                callbacks.on_incoming_audio_frame(&bin_data);
                            }
                        }
                    }
                    Message::Text(text) => {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                            let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            match msg_type {
                                "AUTH_RESP" => {
                                    let success = val.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                                    if success {
                                        let ep = val.get("current_epoch").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                                        current_epoch.store(ep, Ordering::SeqCst);

                                        let channels: Vec<ChannelInfo> = val
                                            .get("channels")
                                            .and_then(|v| serde_json::from_value(v.clone()).ok())
                                            .unwrap_or_default();

                                        callbacks.on_connected("evt_active", "Walkie Event", &channels, ep);
                                    } else {
                                        let error = val.get("error").and_then(|v| v.as_str()).unwrap_or("Auth failed");
                                        callbacks.on_disconnected(error);
                                        break;
                                    }
                                }
                                "FLOOR_GRANT" => {
                                    let ch_id = val.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let lease_id = val.get("lease_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let speaker_id = val.get("speaker_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let speaker_name = val.get("speaker_name").and_then(|v| v.as_str()).unwrap_or("");
                                    let ep = val.get("epoch").and_then(|v| v.as_u64()).unwrap_or(1) as u32;

                                    if speaker_id == device_id {
                                        let mut state = floor_state.write().await;
                                        let mut canceled = canceled_req_id.write().await;

                                        if *state == ClientFloorState::Idle || canceled.is_some() {
                                            *canceled = None;
                                            let rel_msg = json!({
                                                "type": "FLOOR_REL",
                                                "channel_id": ch_id,
                                                "lease_id": lease_id,
                                                "device_id": device_id
                                            }).to_string();
                                            let _ = tx.send(Message::text(rel_msg));
                                        } else {
                                            *state = ClientFloorState::Transmitting {
                                                lease_id: lease_id.to_string(),
                                                epoch: ep,
                                            };
                                            callbacks.on_floor_granted("", ch_id, lease_id, ep);
                                        }
                                    } else {
                                        callbacks.on_speaker_changed(ch_id, Some(speaker_id), Some(speaker_name));
                                    }
                                }
                                "FLOOR_BUSY" => {
                                    let ch_id = val.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let spk_id = val.get("speaker_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let spk_name = val.get("speaker_name").and_then(|v| v.as_str()).unwrap_or("");

                                    if spk_id != device_id {
                                        let mut state = floor_state.write().await;
                                        if matches!(*state, ClientFloorState::Requesting { .. }) {
                                            *state = ClientFloorState::Busy {
                                                holder_name: spk_name.to_string(),
                                            };
                                            callbacks.on_floor_busy(ch_id, spk_name);
                                        }
                                        callbacks.on_speaker_changed(ch_id, Some(spk_id), Some(spk_name));
                                    }
                                }
                                "FLOOR_REVOKE" => {
                                    let ch_id = val.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let lease_id = val.get("lease_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let reason = val.get("reason").and_then(|v| v.as_str()).unwrap_or("");

                                    {
                                        let mut state = floor_state.write().await;
                                        *state = ClientFloorState::Idle;
                                    }
                                    callbacks.on_floor_revoked(ch_id, lease_id, reason);
                                    callbacks.on_speaker_changed(ch_id, None, None);
                                }
                                "FLOOR_IDLE" => {
                                    let ch_id = val.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
                                    {
                                        let mut state = floor_state.write().await;
                                        if !matches!(*state, ClientFloorState::Transmitting { .. }) {
                                            *state = ClientFloorState::Idle;
                                        }
                                    }
                                    callbacks.on_speaker_changed(ch_id, None, None);
                                }
                                "CHANNEL_LOCKED" => {
                                    let ch_id = val.get("channel_id").and_then(|v| v.as_str()).unwrap_or("");
                                    let ch_name = val.get("channel_name").and_then(|v| v.as_str()).unwrap_or("");
                                    let locked = val.get("locked").and_then(|v| v.as_bool()).unwrap_or(false);

                                    is_channel_locked.store(locked, Ordering::SeqCst);
                                    if locked && !ch_id.is_empty() {
                                        let ch_hash = hash_channel_id(ch_id);
                                        {
                                            let mut ch = current_channel_id.write().await;
                                            *ch = ch_id.to_string();
                                            let mut hash = current_channel_hash.write().await;
                                            *hash = ch_hash;
                                        }
                                    }
                                    callbacks.on_channel_locked(ch_id, ch_name, locked);
                                }
                                "PONG" => {
                                    let sent_ts = val.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0);
                                    let now_ms = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis() as u64;
                                    if now_ms >= sent_ts {
                                        let rtt = now_ms - sent_ts;
                                        avg_rtt_ms.store(rtt, Ordering::SeqCst);
                                    }
                                }
                                "MEMBER_REVOKED" => {
                                    let reason = val.get("reason").and_then(|v| v.as_str()).unwrap_or("Revoked");
                                    callbacks.on_disconnected(reason);
                                    break;
                                }
                                "HOST_STOPPED" => {
                                    callbacks.on_disconnected("Host stopped event");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }

            is_connected.store(false, Ordering::SeqCst);
            {
                let mut state = floor_state.write().await;
                *state = ClientFloorState::Disconnected;
            }
            {
                let mut tx_lock = tx_ws_clone.lock().await;
                *tx_lock = None;
            }
            callbacks.on_disconnected("Connection closed");
        });

        Ok(())
    }

    pub async fn select_channel(&self, channel_id: &str) -> bool {
        if self.is_channel_locked.load(Ordering::SeqCst) {
            return false;
        }

        let ch_hash = hash_channel_id(channel_id);
        {
            let mut ch = self.current_channel_id.write().await;
            *ch = channel_id.to_string();
            let mut hash = self.current_channel_hash.write().await;
            *hash = ch_hash;
        }

        self.release_floor().await;

        let msg = json!({
            "type": "CHANNEL_SWITCH",
            "channel_id": channel_id,
            "device_id": self.device_id
        }).to_string();

        let tx_lock = self.tx_ws.lock().await;
        if let Some(ref tx) = *tx_lock {
            let _ = tx.send(Message::text(msg));
        }
        true
    }

    pub async fn request_floor(&self, req_id: &str) {
        let channel_id = self.current_channel_id.read().await.clone();

        {
            let mut state = self.floor_state.write().await;
            *state = ClientFloorState::Requesting {
                req_id: req_id.to_string(),
            };
            let mut canceled = self.canceled_req_id.write().await;
            *canceled = None;
        }

        let msg = json!({
            "type": "FLOOR_REQ",
            "channel_id": channel_id,
            "req_id": req_id,
            "device_id": self.device_id
        }).to_string();

        let tx_lock = self.tx_ws.lock().await;
        if let Some(ref tx) = *tx_lock {
            let _ = tx.send(Message::text(msg));
        }
    }

    pub async fn release_floor(&self) {
        let channel_id = self.current_channel_id.read().await.clone();
        let mut state = self.floor_state.write().await;

        match *state {
            ClientFloorState::Transmitting { ref lease_id, .. } => {
                let msg = json!({
                    "type": "FLOOR_REL",
                    "channel_id": channel_id,
                    "lease_id": lease_id,
                    "device_id": self.device_id
                }).to_string();

                let tx_lock = self.tx_ws.lock().await;
                if let Some(ref tx) = *tx_lock {
                    let _ = tx.send(Message::text(msg));
                }
                *state = ClientFloorState::Idle;
            }
            ClientFloorState::Requesting { ref req_id } => {
                let mut canceled = self.canceled_req_id.write().await;
                *canceled = Some(req_id.clone());
                *state = ClientFloorState::Idle;
            }
            _ => {
                *state = ClientFloorState::Idle;
            }
        }
    }

    pub async fn send_audio_frame(&self, pcm_payload: &[u8]) -> bool {
        let state = self.floor_state.read().await;
        let epoch = match *state {
            ClientFloorState::Transmitting { epoch, .. } => epoch,
            _ => return false,
        };
        drop(state);

        let ch_hash = *self.current_channel_hash.read().await;
        let seq = self.seq_number.fetch_add(1, Ordering::SeqCst);
        let now_ts = (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() & 0xFFFFFFFF) as u32;

        let frame = pack_audio_frame(ch_hash, epoch, seq, now_ts, pcm_payload);

        let tx_lock = self.tx_ws.lock().await;
        if let Some(ref tx) = *tx_lock {
            self.packets_sent.fetch_add(1, Ordering::SeqCst);
            tx.send(Message::binary(frame)).is_ok()
        } else {
            false
        }
    }

    pub fn get_diagnostics(&self) -> Diagnostics {
        Diagnostics {
            rtt_ms: self.avg_rtt_ms.load(Ordering::SeqCst),
            jitter_ms: 2.5,
            packets_sent: self.packets_sent.load(Ordering::SeqCst),
            packets_received: self.packets_recv.load(Ordering::SeqCst),
        }
    }

    pub async fn close(&self) {
        let mut tx_lock = self.tx_ws.lock().await;
        if let Some(tx) = tx_lock.take() {
            let _ = tx.send(Message::Close(None));
        }
        self.is_connected.store(false, Ordering::SeqCst);
        let mut state = self.floor_state.write().await;
        *state = ClientFloorState::Disconnected;
    }
}
