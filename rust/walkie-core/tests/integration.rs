use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use walkie_core::client::{ClientCallbacks, Diagnostics, WalkieClient};
use walkie_core::protocol::ChannelInfo;
use walkie_core::security::SecurityManager;
use walkie_core::server::{ServerConfig, WalkieHostServer};
use walkie_core::storage::HostStorage;

struct TestCallbacks {
    #[allow(dead_code)]
    name: String,
    connected: AtomicBool,
    last_speaker: Arc<Mutex<Option<(String, Option<String>)>>>,
    floor_granted: AtomicBool,
    floor_busy: AtomicBool,
    audio_frames_received: AtomicUsize,
    disconnected_reason: Arc<Mutex<Option<String>>>,
    locked_channel: Arc<Mutex<Option<(String, bool)>>>,
}

impl TestCallbacks {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            connected: AtomicBool::new(false),
            last_speaker: Arc::new(Mutex::new(None)),
            floor_granted: AtomicBool::new(false),
            floor_busy: AtomicBool::new(false),
            audio_frames_received: AtomicUsize::new(0),
            disconnected_reason: Arc::new(Mutex::new(None)),
            locked_channel: Arc::new(Mutex::new(None)),
        }
    }
}

impl ClientCallbacks for TestCallbacks {
    fn on_connected(&self, _event_id: &str, _event_name: &str, _channels: &[ChannelInfo], _epoch: u32) {
        self.connected.store(true, Ordering::SeqCst);
    }

    fn on_disconnected(&self, reason: &str) {
        self.connected.store(false, Ordering::SeqCst);
        let mut r = self.disconnected_reason.try_lock().ok();
        if let Some(ref mut lock) = r {
            **lock = Some(reason.to_string());
        }
    }

    fn on_floor_granted(&self, _req_id: &str, _channel_id: &str, _lease_id: &str, _epoch: u32) {
        self.floor_granted.store(true, Ordering::SeqCst);
    }

    fn on_floor_busy(&self, _channel_id: &str, _holder_name: &str) {
        self.floor_busy.store(true, Ordering::SeqCst);
    }

    fn on_floor_revoked(&self, _channel_id: &str, _lease_id: &str, _reason: &str) {
        self.floor_granted.store(false, Ordering::SeqCst);
    }

    fn on_speaker_changed(&self, channel_id: &str, _speaker_id: Option<&str>, speaker_name: Option<&str>) {
        if let Ok(mut lock) = self.last_speaker.try_lock() {
            *lock = Some((channel_id.to_string(), speaker_name.map(|s| s.to_string())));
        }
    }

    fn on_channel_locked(&self, channel_id: &str, _channel_name: &str, locked: bool) {
        if let Ok(mut lock) = self.locked_channel.try_lock() {
            *lock = Some((channel_id.to_string(), locked));
        }
    }

    fn on_incoming_audio_frame(&self, _frame: &[u8]) {
        self.audio_frames_received.fetch_add(1, Ordering::SeqCst);
    }

    fn on_diagnostics(&self, _diag: Diagnostics) {}
}

#[tokio::test]
async fn test_full_rust_engine_lifecycle() {
    let security = SecurityManager::new(b"TEST_SECRET_KEY_1234567890".to_vec());
    let storage = HostStorage::new(None); // in-memory
    let channels = vec![
        ChannelInfo {
            id: "ch_stage".into(),
            name: "Stage".into(),
            is_preset: true,
        },
        ChannelInfo {
            id: "ch_prod".into(),
            name: "Production".into(),
            is_preset: true,
        },
    ];

    storage.save_event("evt_pilot", "Venue Pilot", channels.clone(), 1);

    let config = ServerConfig {
        bind_addr: "127.0.0.1:0".to_string(), // Ephemeral port
        event_id: "evt_pilot".into(),
        event_name: "Venue Pilot".into(),
        channels: channels.clone(),
        security: security.clone(),
        storage: storage.clone(),
        on_speaker_changed: None,
        on_member_count_changed: None,
    };

    let server = WalkieHostServer::new(config);
    let port = server.start().await.expect("Server should bind");
    let server_url = format!("ws://127.0.0.1:{}", port);

    let token = security.generate_admission_token("crew", 3600);

    // 1. Connect Client 1 (Alice)
    let alice_cb = Arc::new(TestCallbacks::new("Alice"));
    let alice = WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_alice".into(),
        "Alice".into(),
        "ch_stage".into(),
        alice_cb.clone(),
    );
    alice.connect().await.expect("Alice should connect");

    // 2. Connect Client 2 (Bob)
    let bob_cb = Arc::new(TestCallbacks::new("Bob"));
    let bob = WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_bob".into(),
        "Bob".into(),
        "ch_stage".into(),
        bob_cb.clone(),
    );
    bob.connect().await.expect("Bob should connect");

    // Wait for auth to complete
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(alice_cb.connected.load(Ordering::SeqCst));
    assert!(bob_cb.connected.load(Ordering::SeqCst));

    // 3. Alice requests floor
    alice.request_floor("req_1").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(alice_cb.floor_granted.load(Ordering::SeqCst));

    // 4. Alice sends audio frame -> Bob receives
    let sample_pcm = vec![0x12; 640];
    let sent = alice.send_audio_frame(&sample_pcm).await;
    assert!(sent, "Alice should be permitted to send audio");

    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(bob_cb.audio_frames_received.load(Ordering::SeqCst), 1);

    // 5. Bob requests floor while Alice is talking -> Bob gets busy
    bob.request_floor("req_2").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(bob_cb.floor_busy.load(Ordering::SeqCst));
    assert!(!bob_cb.floor_granted.load(Ordering::SeqCst));

    // 6. Alice releases floor -> Bob (next in FIFO) receives floor grant automatically!
    alice.release_floor().await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(bob_cb.floor_granted.load(Ordering::SeqCst));

    // Bob sends audio -> Alice receives
    let sent_bob = bob.send_audio_frame(&sample_pcm).await;
    assert!(sent_bob);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(alice_cb.audio_frames_received.load(Ordering::SeqCst), 1);

    // Bob releases floor
    bob.release_floor().await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    // 7. Test Invariant: Release BEFORE grant arrives never transmits
    let charlie_cb = Arc::new(TestCallbacks::new("Charlie"));
    let charlie = WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_charlie".into(),
        "Charlie".into(),
        "ch_stage".into(),
        charlie_cb.clone(),
    );
    charlie.connect().await.expect("Charlie connects");
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Charlie requests floor then immediately releases
    charlie.request_floor("req_fast").await;
    charlie.release_floor().await; // Released before grant!

    tokio::time::sleep(Duration::from_millis(200)).await;
    // Charlie should NOT have floor_granted set!
    assert!(!charlie_cb.floor_granted.load(Ordering::SeqCst));
    // Audio frame send must fail
    assert!(!charlie.send_audio_frame(&sample_pcm).await);

    // 8. Test Revocation
    server.revoke_device("dev_charlie", "Rule violation").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(!charlie_cb.connected.load(Ordering::SeqCst));

    // Charlie tries to reconnect -> rejected
    let charlie2 = WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_charlie".into(),
        "Charlie".into(),
        "ch_stage".into(),
        charlie_cb.clone(),
    );
    let _ = charlie2.connect().await;
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(!charlie_cb.connected.load(Ordering::SeqCst));

    // Cleanup
    alice.close().await;
    bob.close().await;
    charlie.close().await;
    server.stop().await;
}

#[tokio::test]
async fn test_channel_locking_and_all_call() {
    let security = SecurityManager::new(b"TEST_SECRET_KEY_LOCKING_ALLCALL".to_vec());
    let storage = HostStorage::new(None);
    let channels = vec![
        ChannelInfo {
            id: "ch_stage".into(),
            name: "Stage".into(),
            is_preset: true,
        },
        ChannelInfo {
            id: "ch_prod".into(),
            name: "Production".into(),
            is_preset: true,
        },
    ];

    let config = ServerConfig {
        bind_addr: "127.0.0.1:0".into(),
        event_id: "evt_lock_test".into(),
        event_name: "Lock Test Event".into(),
        channels: channels.clone(),
        security: security.clone(),
        storage,
        on_speaker_changed: None,
        on_member_count_changed: None,
    };

    let server = Arc::new(WalkieHostServer::new(config));
    let server_clone = Arc::clone(&server);
    let port = server_clone.start().await.expect("Server starts");
    let server_url = format!("ws://127.0.0.1:{}", port);
    let token = security.generate_admission_token("crew", 3600);

    // Alice is on Stage
    let alice_cb = Arc::new(TestCallbacks::new("Alice"));
    let alice = Arc::new(WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_alice".into(),
        "Alice".into(),
        "ch_stage".into(),
        alice_cb.clone(),
    ));
    alice.connect().await.expect("Alice connects");

    // Bob is on Production
    let bob_cb = Arc::new(TestCallbacks::new("Bob"));
    let bob = Arc::new(WalkieClient::new(
        server_url.clone(),
        token.clone(),
        "dev_bob".into(),
        "Bob".into(),
        "ch_prod".into(),
        bob_cb.clone(),
    ));
    bob.connect().await.expect("Bob connects");

    tokio::time::sleep(Duration::from_millis(150)).await;

    // 1. Test Channel Locking: Host locks Bob to "ch_prod"
    let lock_success = server.lock_member_channel("dev_bob", Some("ch_prod")).await;
    assert!(lock_success);

    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(bob.is_locked());
    let bob_lock_event = bob_cb.locked_channel.lock().await.clone();
    assert_eq!(bob_lock_event, Some(("ch_prod".to_string(), true)));

    // Bob attempts to switch to "ch_stage" while locked -> must remain on "ch_prod"
    bob.select_channel("ch_stage").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(bob.current_channel_id().await, "ch_prod");

    // 2. Test Channel Isolation: Alice transmits on Stage
    alice.request_floor("req_alice_stage").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(alice_cb.floor_granted.load(Ordering::SeqCst));

    let sample_pcm = vec![12u8; 160];
    assert!(alice.send_audio_frame(&sample_pcm).await);
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Bob is on Production, so Bob should NOT receive Alice's Stage audio!
    assert_eq!(bob_cb.audio_frames_received.load(Ordering::SeqCst), 0);
    alice.release_floor().await;
    tokio::time::sleep(Duration::from_millis(150)).await;

    // 3. Test All Call / General Voice:
    // Alice switches to General / All-Call channel "ch_all"
    alice.select_channel("ch_all").await;
    tokio::time::sleep(Duration::from_millis(150)).await;

    alice.request_floor("req_alice_allcall").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(alice_cb.floor_granted.load(Ordering::SeqCst));

    // Alice transmits on All Call
    assert!(alice.send_audio_frame(&sample_pcm).await);
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Bob (on Production) MUST receive the All-Call broadcast audio!
    assert!(bob_cb.audio_frames_received.load(Ordering::SeqCst) >= 1);
    alice.release_floor().await;
    tokio::time::sleep(Duration::from_millis(150)).await;

    // 4. Test Unlocking: Host unlocks Bob
    let unlock_success = server.lock_member_channel("dev_bob", None).await;
    assert!(unlock_success);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(!bob.is_locked());
    let bob_unlock_event = bob_cb.locked_channel.lock().await.clone();
    assert_eq!(bob_unlock_event, Some(("ch_prod".to_string(), false)));

    // Now Bob can switch to "ch_stage"
    bob.select_channel("ch_stage").await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(bob.current_channel_id().await, "ch_stage");

    alice.close().await;
    bob.close().await;
    server.stop().await;
}
