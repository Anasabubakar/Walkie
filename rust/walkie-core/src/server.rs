//! Walkie Host WebSocket Server & Zero-Transcoding Audio Relay
//! Runs local Wi-Fi channel service, floor arbitration, and low-latency audio distribution.

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;

use crate::floor::{FloorManager, FloorRequestOutcome};
use crate::protocol::{
    hash_channel_id, unpack_audio_frame, ChannelInfo, ControlMessage, ALL_CALL_CHANNEL_ID,
    AUDIO_FRAME_MAGIC,
};
use crate::security::SecurityManager;
use crate::storage::HostStorage;

#[derive(Clone)]
struct ConnectedClient {
    device_id: String,
    display_name: String,
    channel_id: String,
    locked_channel: Option<String>,
    tx: mpsc::UnboundedSender<Message>,
}

pub type SpeakerChangeCallback = Arc<dyn Fn(&str, Option<&str>, Option<&str>) + Send + Sync>;
pub type MemberCountCallback = Arc<dyn Fn(usize) + Send + Sync>;

pub struct ServerConfig {
    pub bind_addr: String,
    pub event_id: String,
    pub event_name: String,
    pub channels: Vec<ChannelInfo>,
    pub security: SecurityManager,
    pub storage: HostStorage,
    pub on_speaker_changed: Option<SpeakerChangeCallback>,
    pub on_member_count_changed: Option<MemberCountCallback>,
}

pub struct WalkieHostServer {
    config: Arc<ServerConfig>,
    floor_manager: Arc<Mutex<FloorManager>>,
    clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
    epoch: Arc<AtomicU32>,
    is_running: Arc<AtomicBool>,
    stop_tx: broadcast::Sender<()>,
}

impl WalkieHostServer {
    pub fn new(config: ServerConfig) -> Self {
        let (stop_tx, _) = broadcast::channel(1);
        let epoch = Arc::new(AtomicU32::new(config.storage.get_event().map(|e| e.epoch).unwrap_or(1)));

        Self {
            config: Arc::new(config),
            floor_manager: Arc::new(Mutex::new(FloorManager::new())),
            clients: Arc::new(RwLock::new(HashMap::new())),
            epoch,
            is_running: Arc::new(AtomicBool::new(false)),
            stop_tx,
        }
    }

    pub fn current_epoch(&self) -> u32 {
        self.epoch.load(Ordering::SeqCst)
    }

    pub fn increment_epoch(&self) -> u32 {
        let ep = self.config.storage.increment_epoch();
        self.epoch.store(ep, Ordering::SeqCst);
        ep
    }

    pub async fn start(&self) -> Result<u16, String> {
        let listener = TcpListener::bind(&self.config.bind_addr)
            .await
            .map_err(|e| format!("Failed to bind server to {}: {}", self.config.bind_addr, e))?;

        let local_addr = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?;
        let port = local_addr.port();

        self.is_running.store(true, Ordering::SeqCst);

        let config = Arc::clone(&self.config);
        let floor_manager = Arc::clone(&self.floor_manager);
        let clients = Arc::clone(&self.clients);
        let epoch = Arc::clone(&self.epoch);
        let is_running = Arc::clone(&self.is_running);
        let mut stop_rx = self.stop_tx.subscribe();

        // 1. Housekeeping loop: checks floor timeouts every 500ms
        let fm_clone = Arc::clone(&floor_manager);
        let clients_clone = Arc::clone(&clients);
        let epoch_clone = Arc::clone(&epoch);
        let is_running_clone = Arc::clone(&is_running);
        let config_clone = Arc::clone(&config);
        let mut stop_rx2 = self.stop_tx.subscribe();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            while is_running_clone.load(Ordering::SeqCst) {
                tokio::select! {
                    _ = interval.tick() => {
                        let now_ms = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        let ep = epoch_clone.load(Ordering::SeqCst);

                        let expired = {
                            let mut fm = fm_clone.lock().await;
                            fm.check_timeouts(now_ms, ep)
                        };

                        for (revoked_grant, reason, next_grant) in expired {
                            let is_all_call = revoked_grant.channel_id == ALL_CALL_CHANNEL_ID;
                            let revoke_msg = json!({
                                "type": "FLOOR_REVOKE",
                                "channel_id": revoked_grant.channel_id,
                                "lease_id": revoked_grant.lease_id,
                                "reason": reason
                            }).to_string();

                            let clients_read = clients_clone.read().await;
                            if let Some(client) = clients_read.get(&revoked_grant.speaker_id) {
                                let _ = client.tx.send(Message::text(&revoke_msg));
                            }

                            if let Some(next) = next_grant {
                                let next_is_all_call = next.channel_id == ALL_CALL_CHANNEL_ID;
                                let grant_msg = json!({
                                    "type": "FLOOR_GRANT",
                                    "channel_id": next.channel_id,
                                    "lease_id": next.lease_id,
                                    "speaker_id": next.speaker_id,
                                    "speaker_name": next.speaker_name,
                                    "epoch": next.epoch,
                                    "expires_at": next.expires_at_ms
                                }).to_string();

                                let busy_msg = json!({
                                    "type": "FLOOR_BUSY",
                                    "channel_id": next.channel_id,
                                    "speaker_id": next.speaker_id,
                                    "speaker_name": next.speaker_name,
                                    "is_all_call": next_is_all_call
                                }).to_string();

                                for client in clients_read.values() {
                                    if next_is_all_call || client.channel_id == next.channel_id {
                                        if client.device_id == next.speaker_id {
                                            let _ = client.tx.send(Message::text(&grant_msg));
                                        } else {
                                            let _ = client.tx.send(Message::text(&busy_msg));
                                        }
                                    }
                                }

                                if let Some(ref cb) = config_clone.on_speaker_changed {
                                    cb(&next.channel_id, Some(&next.speaker_id), Some(&next.speaker_name));
                                }
                            } else {
                                let idle_msg = json!({
                                    "type": "FLOOR_IDLE",
                                    "channel_id": revoked_grant.channel_id
                                }).to_string();

                                for client in clients_read.values() {
                                    if is_all_call || client.channel_id == revoked_grant.channel_id {
                                        let _ = client.tx.send(Message::text(&idle_msg));
                                    }
                                }

                                if let Some(ref cb) = config_clone.on_speaker_changed {
                                    cb(&revoked_grant.channel_id, None, None);
                                }
                            }
                        }
                    }
                    _ = stop_rx2.recv() => {
                        break;
                    }
                }
            }
        });

        // 2. Accept loop: accepts incoming TCP connections
        tokio::spawn(async move {
            while is_running.load(Ordering::SeqCst) {
                tokio::select! {
                    res = listener.accept() => {
                        match res {
                            Ok((stream, addr)) => {
                                let config = Arc::clone(&config);
                                let floor_manager = Arc::clone(&floor_manager);
                                let clients = Arc::clone(&clients);
                                let epoch = Arc::clone(&epoch);

                                tokio::spawn(async move {
                                    Self::handle_connection(
                                        stream,
                                        addr,
                                        config,
                                        floor_manager,
                                        clients,
                                        epoch,
                                    ).await;
                                });
                            }
                            Err(_) => break,
                        }
                    }
                    _ = stop_rx.recv() => {
                        break;
                    }
                }
            }
        });

        Ok(port)
    }

    pub async fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        let _ = self.stop_tx.send(());

        // Notify and disconnect all clients
        let stop_msg = json!({
            "type": "HOST_STOPPED",
            "reason": "Host terminated event"
        }).to_string();

        let mut clients_write = self.clients.write().await;
        for (_, client) in clients_write.drain() {
            let _ = client.tx.send(Message::text(&stop_msg));
            let _ = client.tx.send(Message::Close(None));
        }
    }

    pub async fn revoke_device(&self, device_id: &str, reason: &str) -> bool {
        self.config.storage.revoke_device(device_id);
        self.increment_epoch();

        let revoke_msg = json!({
            "type": "MEMBER_REVOKED",
            "device_id": device_id,
            "reason": reason
        }).to_string();

        let mut clients_write = self.clients.write().await;
        if let Some(client) = clients_write.remove(device_id) {
            let _ = client.tx.send(Message::text(&revoke_msg));
            let _ = client.tx.send(Message::Close(None));

            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            let current_ep = self.current_epoch();

            let mut fm = self.floor_manager.lock().await;
            fm.remove_device(device_id, current_ep, now_ms);
            true
        } else {
            false
        }
    }

    pub async fn lock_member_channel(&self, target_device_id: &str, channel_id: Option<&str>) -> bool {
        let mut clients_write = self.clients.write().await;
        if let Some(target) = clients_write.get_mut(target_device_id) {
            target.locked_channel = channel_id.map(|s| s.to_string());
            if let Some(ch_id) = channel_id {
                target.channel_id = ch_id.to_string();
                let ch_name = self
                    .config
                    .channels
                    .iter()
                    .find(|c| c.id == ch_id)
                    .map(|c| c.name.clone())
                    .unwrap_or_else(|| ch_id.to_string());
                let locked_msg = json!({
                    "type": "CHANNEL_LOCKED",
                    "channel_id": ch_id,
                    "channel_name": ch_name,
                    "locked": true
                }).to_string();
                let _ = target.tx.send(Message::text(locked_msg));
            } else {
                let unlocked_msg = json!({
                    "type": "CHANNEL_LOCKED",
                    "channel_id": target.channel_id,
                    "channel_name": "",
                    "locked": false
                }).to_string();
                let _ = target.tx.send(Message::text(unlocked_msg));
            }
            true
        } else {
            false
        }
    }

    pub async fn get_connected_members_json(&self) -> String {
        let clients_read = self.clients.read().await;
        let list: Vec<serde_json::Value> = clients_read
            .values()
            .map(|c| {
                json!({
                    "deviceId": c.device_id,
                    "displayName": c.display_name,
                    "channelId": c.channel_id,
                    "lockedChannel": c.locked_channel
                })
            })
            .collect();
        serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string())
    }

    async fn handle_connection(
        stream: TcpStream,
        _addr: SocketAddr,
        config: Arc<ServerConfig>,
        floor_manager: Arc<Mutex<FloorManager>>,
        clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
        epoch: Arc<AtomicU32>,
    ) {
        let ws_stream = match tokio_tungstenite::accept_async(stream).await {
            Ok(ws) => ws,
            Err(_) => return,
        };

        let (mut ws_sink, mut ws_stream) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

        // Writer pump
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sink.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Initial Auth Handshake
        let auth_future = ws_stream.next();
        let auth_msg = match tokio::time::timeout(Duration::from_secs(5), auth_future).await {
            Ok(Some(Ok(Message::Text(text)))) => text,
            _ => {
                let err_msg = json!({
                    "type": "AUTH_RESP",
                    "success": false,
                    "error": "Handshake timeout or invalid initial message"
                }).to_string();
                let _ = tx.send(Message::text(err_msg));
                return;
            }
        };

        let auth_req: ControlMessage = match serde_json::from_str(&auth_msg) {
            Ok(req) => req,
            Err(_) => {
                let err_msg = json!({
                    "type": "AUTH_RESP",
                    "success": false,
                    "error": "Malformed AUTH_REQ JSON"
                }).to_string();
                let _ = tx.send(Message::text(err_msg));
                return;
            }
        };

        let (device_id, display_name, requested_channel) = match auth_req {
            ControlMessage::AuthRequest {
                admission_token,
                device_id,
                display_name,
                channel_id,
                ..
            } => {
                if let Err(err) = config.security.verify_admission_token(&admission_token) {
                    let err_msg = json!({
                        "type": "AUTH_RESP",
                        "success": false,
                        "error": format!("Admission token rejected: {}", err)
                    }).to_string();
                    let _ = tx.send(Message::text(err_msg));
                    return;
                }

                if config.storage.is_device_revoked(&device_id) {
                    let err_msg = json!({
                        "type": "AUTH_RESP",
                        "success": false,
                        "error": "Device has been revoked"
                    }).to_string();
                    let _ = tx.send(Message::text(err_msg));
                    return;
                }

                (device_id, display_name, channel_id)
            }
            _ => {
                let err_msg = json!({
                    "type": "AUTH_RESP",
                    "success": false,
                    "error": "Expected AUTH_REQ"
                }).to_string();
                let _ = tx.send(Message::text(err_msg));
                return;
            }
        };

        let current_ep = epoch.load(Ordering::SeqCst);
        let initial_channel = if config.channels.iter().any(|c| c.id == requested_channel) {
            requested_channel
        } else {
            config
                .channels
                .first()
                .map(|c| c.id.clone())
                .unwrap_or_else(|| "ch_stage".to_string())
        };

        let client_conn = ConnectedClient {
            device_id: device_id.clone(),
            display_name: display_name.clone(),
            channel_id: initial_channel.clone(),
            locked_channel: None,
            tx: tx.clone(),
        };

        // Register client
        {
            let mut clients_write = clients.write().await;
            clients_write.insert(device_id.clone(), client_conn);
            let count = clients_write.len();
            if let Some(ref cb) = config.on_member_count_changed {
                cb(count);
            }
        }

        // Send AUTH_RESP success
        let auth_resp = json!({
            "type": "AUTH_RESP",
            "success": true,
            "channels": config.channels,
            "current_epoch": current_ep
        }).to_string();
        let _ = tx.send(Message::text(auth_resp));

        // If initial channel has active speaker, inform the newly connected client
        {
            let fm = floor_manager.lock().await;
            if let Some((speaker_id, speaker_name)) = fm.get_active_speaker(&initial_channel) {
                let busy_msg = json!({
                    "type": "FLOOR_BUSY",
                    "channel_id": initial_channel,
                    "speaker_id": speaker_id,
                    "speaker_name": speaker_name,
                    "is_all_call": false
                }).to_string();
                let _ = tx.send(Message::text(busy_msg));
            }
        }

        let all_call_hash = hash_channel_id(ALL_CALL_CHANNEL_ID);

        // Reader pump: processes client messages
        while let Some(Ok(msg)) = ws_stream.next().await {
            match msg {
                Message::Binary(bin_data) => {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    let current_ep = epoch.load(Ordering::SeqCst);

                    if let Some((header, _)) = unpack_audio_frame(&bin_data) {
                        if header.magic == AUDIO_FRAME_MAGIC && header.epoch == current_ep {
                            let is_all_call = header.channel_hash == all_call_hash;

                            let can_transmit = {
                                let mut fm = floor_manager.lock().await;
                                let channel_id = if is_all_call {
                                    ALL_CALL_CHANNEL_ID.to_string()
                                } else {
                                    let clients_read = clients.read().await;
                                    clients_read
                                        .get(&device_id)
                                        .map(|c| c.channel_id.clone())
                                        .unwrap_or_default()
                                };
                                fm.on_audio_received(&channel_id, &device_id, current_ep, now_ms)
                            };

                            if can_transmit {
                                let clients_read = clients.read().await;
                                let sender_channel = clients_read
                                    .get(&device_id)
                                    .map(|c| c.channel_id.as_str())
                                    .unwrap_or("");

                                for (id, c) in clients_read.iter() {
                                    if id != &device_id {
                                        if is_all_call || c.channel_id == sender_channel {
                                            let _ = c.tx.send(Message::binary(bin_data.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Message::Text(text) => {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    let current_ep = epoch.load(Ordering::SeqCst);

                    if let Ok(ctrl) = serde_json::from_str::<ControlMessage>(&text) {
                        match ctrl {
                            ControlMessage::FloorRequest {
                                channel_id,
                                req_id,
                                device_id: req_dev,
                            } => {
                                if req_dev == device_id {
                                    let is_all_call = channel_id == ALL_CALL_CHANNEL_ID;
                                    let outcome = {
                                        let mut fm = floor_manager.lock().await;
                                        fm.request_floor(
                                            &channel_id,
                                            &req_id,
                                            &device_id,
                                            &display_name,
                                            current_ep,
                                            now_ms,
                                        )
                                    };

                                    match outcome {
                                        FloorRequestOutcome::Granted(grant) => {
                                            let grant_msg = json!({
                                                "type": "FLOOR_GRANT",
                                                "channel_id": grant.channel_id,
                                                "lease_id": grant.lease_id,
                                                "speaker_id": grant.speaker_id,
                                                "speaker_name": grant.speaker_name,
                                                "epoch": grant.epoch,
                                                "expires_at": grant.expires_at_ms,
                                                "is_all_call": is_all_call
                                            }).to_string();

                                            let busy_msg = json!({
                                                "type": "FLOOR_BUSY",
                                                "channel_id": grant.channel_id,
                                                "speaker_id": grant.speaker_id,
                                                "speaker_name": grant.speaker_name,
                                                "is_all_call": is_all_call
                                            }).to_string();

                                            let clients_read = clients.read().await;
                                            for c in clients_read.values() {
                                                if is_all_call || c.channel_id == grant.channel_id {
                                                    if c.device_id == device_id {
                                                        let _ = c.tx.send(Message::text(&grant_msg));
                                                    } else {
                                                        let _ = c.tx.send(Message::text(&busy_msg));
                                                    }
                                                }
                                            }

                                            if let Some(ref cb) = config.on_speaker_changed {
                                                cb(&grant.channel_id, Some(&grant.speaker_id), Some(&grant.speaker_name));
                                            }
                                        }
                                        FloorRequestOutcome::Busy {
                                            speaker_id,
                                            speaker_name,
                                        } => {
                                            let busy_msg = json!({
                                                "type": "FLOOR_BUSY",
                                                "channel_id": channel_id,
                                                "speaker_id": speaker_id,
                                                "speaker_name": speaker_name,
                                                "is_all_call": is_all_call
                                            }).to_string();
                                            let _ = tx.send(Message::text(busy_msg));
                                        }
                                    }
                                }
                            }
                            ControlMessage::FloorRelease {
                                channel_id,
                                lease_id,
                                device_id: rel_dev,
                            } => {
                                if rel_dev == device_id {
                                    let is_all_call = channel_id == ALL_CALL_CHANNEL_ID;
                                    let (released, next_grant) = {
                                        let mut fm = floor_manager.lock().await;
                                        fm.release_floor(
                                            &channel_id,
                                            &lease_id,
                                            &device_id,
                                            current_ep,
                                            now_ms,
                                        )
                                    };

                                    if released {
                                        let clients_read = clients.read().await;
                                        if let Some(next) = next_grant {
                                            let next_is_all_call = next.channel_id == ALL_CALL_CHANNEL_ID;
                                            let grant_msg = json!({
                                                "type": "FLOOR_GRANT",
                                                "channel_id": next.channel_id,
                                                "lease_id": next.lease_id,
                                                "speaker_id": next.speaker_id,
                                                "speaker_name": next.speaker_name,
                                                "epoch": next.epoch,
                                                "expires_at": next.expires_at_ms,
                                                "is_all_call": next_is_all_call
                                            }).to_string();

                                            let busy_msg = json!({
                                                "type": "FLOOR_BUSY",
                                                "channel_id": next.channel_id,
                                                "speaker_id": next.speaker_id,
                                                "speaker_name": next.speaker_name,
                                                "is_all_call": next_is_all_call
                                            }).to_string();

                                            for c in clients_read.values() {
                                                if next_is_all_call || c.channel_id == next.channel_id {
                                                    if c.device_id == next.speaker_id {
                                                        let _ = c.tx.send(Message::text(&grant_msg));
                                                    } else {
                                                        let _ = c.tx.send(Message::text(&busy_msg));
                                                    }
                                                }
                                            }

                                            if let Some(ref cb) = config.on_speaker_changed {
                                                cb(&next.channel_id, Some(&next.speaker_id), Some(&next.speaker_name));
                                            }
                                        } else {
                                            let idle_msg = json!({
                                                "type": "FLOOR_IDLE",
                                                "channel_id": channel_id
                                            }).to_string();

                                            for c in clients_read.values() {
                                                if is_all_call || c.channel_id == channel_id {
                                                    let _ = c.tx.send(Message::text(&idle_msg));
                                                }
                                            }

                                            if let Some(ref cb) = config.on_speaker_changed {
                                                cb(&channel_id, None, None);
                                            }
                                        }
                                    }
                                }
                            }
                            ControlMessage::ChannelSwitch {
                                channel_id: new_channel,
                                device_id: sw_dev,
                            } => {
                                if sw_dev == device_id {
                                    // Check if channel is locked by host!
                                    let is_locked = {
                                        let clients_read = clients.read().await;
                                        clients_read.get(&device_id).and_then(|c| c.locked_channel.clone())
                                    };

                                    if let Some(ref locked_ch) = is_locked {
                                        if new_channel != *locked_ch {
                                            let ch_name = config
                                                .channels
                                                .iter()
                                                .find(|c| c.id == *locked_ch)
                                                .map(|c| c.name.clone())
                                                .unwrap_or_else(|| locked_ch.clone());
                                            let locked_msg = json!({
                                                "type": "CHANNEL_LOCKED",
                                                "channel_id": locked_ch,
                                                "channel_name": ch_name,
                                                "locked": true
                                            }).to_string();
                                            let _ = tx.send(Message::text(locked_msg));
                                            continue;
                                        }
                                    }

                                    // Release floor on old channel
                                    let vacated = {
                                        let mut fm = floor_manager.lock().await;
                                        fm.remove_device(&device_id, current_ep, now_ms)
                                    };

                                    let clients_read = clients.read().await;
                                    for (vac_ch, _, next_grant) in vacated {
                                        if let Some(next) = next_grant {
                                            let next_is_all_call = next.channel_id == ALL_CALL_CHANNEL_ID;
                                            let grant_msg = json!({
                                                "type": "FLOOR_GRANT",
                                                "channel_id": next.channel_id,
                                                "lease_id": next.lease_id,
                                                "speaker_id": next.speaker_id,
                                                "speaker_name": next.speaker_name,
                                                "epoch": next.epoch,
                                                "expires_at": next.expires_at_ms,
                                                "is_all_call": next_is_all_call
                                            }).to_string();

                                            let busy_msg = json!({
                                                "type": "FLOOR_BUSY",
                                                "channel_id": next.channel_id,
                                                "speaker_id": next.speaker_id,
                                                "speaker_name": next.speaker_name,
                                                "is_all_call": next_is_all_call
                                            }).to_string();

                                            for c in clients_read.values() {
                                                if next_is_all_call || c.channel_id == vac_ch {
                                                    if c.device_id == next.speaker_id {
                                                        let _ = c.tx.send(Message::text(&grant_msg));
                                                    } else {
                                                        let _ = c.tx.send(Message::text(&busy_msg));
                                                    }
                                                }
                                            }

                                            if let Some(ref cb) = config.on_speaker_changed {
                                                cb(&vac_ch, Some(&next.speaker_id), Some(&next.speaker_name));
                                            }
                                        } else {
                                            let idle_msg = json!({
                                                "type": "FLOOR_IDLE",
                                                "channel_id": vac_ch
                                            }).to_string();

                                            for c in clients_read.values() {
                                                if c.channel_id == vac_ch {
                                                    let _ = c.tx.send(Message::text(&idle_msg));
                                                }
                                            }

                                            if let Some(ref cb) = config.on_speaker_changed {
                                                cb(&vac_ch, None, None);
                                            }
                                        }
                                    }
                                    drop(clients_read);

                                    // Update client channel
                                    {
                                        let mut clients_write = clients.write().await;
                                        if let Some(client) = clients_write.get_mut(&device_id) {
                                            client.channel_id = new_channel.clone();
                                        }
                                    }

                                    // If new channel has speaker, inform client
                                    let fm = floor_manager.lock().await;
                                    if let Some((spk_id, spk_name)) = fm.get_active_speaker(&new_channel) {
                                        let busy_msg = json!({
                                            "type": "FLOOR_BUSY",
                                            "channel_id": new_channel,
                                            "speaker_id": spk_id,
                                            "speaker_name": spk_name,
                                            "is_all_call": false
                                        }).to_string();
                                        let _ = tx.send(Message::text(busy_msg));
                                    }
                                }
                            }
                            ControlMessage::LockChannelRequest {
                                target_device_id,
                                channel_id: lock_target_ch,
                            } => {
                                let mut clients_write = clients.write().await;
                                if let Some(target) = clients_write.get_mut(&target_device_id) {
                                    target.locked_channel = lock_target_ch.clone();
                                    if let Some(ref ch_id) = lock_target_ch {
                                        target.channel_id = ch_id.clone();
                                        let ch_name = config
                                            .channels
                                            .iter()
                                            .find(|c| c.id == *ch_id)
                                            .map(|c| c.name.clone())
                                            .unwrap_or_else(|| ch_id.clone());
                                        let locked_msg = json!({
                                            "type": "CHANNEL_LOCKED",
                                            "channel_id": ch_id,
                                            "channel_name": ch_name,
                                            "locked": true
                                        }).to_string();
                                        let _ = target.tx.send(Message::text(locked_msg));
                                    } else {
                                        let unlocked_msg = json!({
                                            "type": "CHANNEL_LOCKED",
                                            "channel_id": target.channel_id,
                                            "channel_name": "",
                                            "locked": false
                                        }).to_string();
                                        let _ = target.tx.send(Message::text(unlocked_msg));
                                    }
                                }
                            }
                            ControlMessage::Ping { timestamp } => {
                                let pong = json!({
                                    "type": "PONG",
                                    "timestamp": timestamp
                                }).to_string();
                                let _ = tx.send(Message::text(pong));
                            }
                            _ => {}
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        // Connection cleanup on disconnect
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let current_ep = epoch.load(Ordering::SeqCst);

        let vacated = {
            let mut fm = floor_manager.lock().await;
            fm.remove_device(&device_id, current_ep, now_ms)
        };

        {
            let mut clients_write = clients.write().await;
            clients_write.remove(&device_id);
            let count = clients_write.len();
            if let Some(ref cb) = config.on_member_count_changed {
                cb(count);
            }
        }

        let clients_read = clients.read().await;
        for (vac_ch, _, next_grant) in vacated {
            let is_all_call = vac_ch == ALL_CALL_CHANNEL_ID;
            if let Some(next) = next_grant {
                let next_is_all_call = next.channel_id == ALL_CALL_CHANNEL_ID;
                let grant_msg = json!({
                    "type": "FLOOR_GRANT",
                    "channel_id": next.channel_id,
                    "lease_id": next.lease_id,
                    "speaker_id": next.speaker_id,
                    "speaker_name": next.speaker_name,
                    "epoch": next.epoch,
                    "expires_at": next.expires_at_ms,
                    "is_all_call": next_is_all_call
                }).to_string();

                let busy_msg = json!({
                    "type": "FLOOR_BUSY",
                    "channel_id": next.channel_id,
                    "speaker_id": next.speaker_id,
                    "speaker_name": next.speaker_name,
                    "is_all_call": next_is_all_call
                }).to_string();

                for c in clients_read.values() {
                    if next_is_all_call || c.channel_id == next.channel_id {
                        if c.device_id == next.speaker_id {
                            let _ = c.tx.send(Message::text(&grant_msg));
                        } else {
                            let _ = c.tx.send(Message::text(&busy_msg));
                        }
                    }
                }

                if let Some(ref cb) = config.on_speaker_changed {
                    cb(&next.channel_id, Some(&next.speaker_id), Some(&next.speaker_name));
                }
            } else {
                let idle_msg = json!({
                    "type": "FLOOR_IDLE",
                    "channel_id": vac_ch
                }).to_string();

                for c in clients_read.values() {
                    if is_all_call || c.channel_id == vac_ch {
                        let _ = c.tx.send(Message::text(&idle_msg));
                    }
                }

                if let Some(ref cb) = config.on_speaker_changed {
                    cb(&vac_ch, None, None);
                }
            }
        }
    }
}
