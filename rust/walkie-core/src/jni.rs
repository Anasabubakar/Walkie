//! JNI Bridge for Expo Walkie Native Module
//! Connects Android Kotlin layer directly to the high-performance Rust core engine.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use jni::objects::{GlobalRef, JByteArray, JClass, JObject, JString};
use jni::sys::{jboolean, jint, jlong, jstring, JNI_FALSE, JNI_TRUE};
use jni::{JNIEnv, JavaVM};
use serde_json::json;
use tokio::runtime::Runtime;

use crate::client::{ClientCallbacks, Diagnostics, WalkieClient};
use crate::protocol::ChannelInfo;
use crate::security::SecurityManager;
use crate::server::{ServerConfig, WalkieHostServer};
use crate::storage::HostStorage;

static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static GLOBAL_VM: OnceLock<JavaVM> = OnceLock::new();
static GLOBAL_CALLBACK: OnceLock<Mutex<Option<GlobalRef>>> = OnceLock::new();

static HOST_SERVER: Mutex<Option<Arc<WalkieHostServer>>> = Mutex::new(None);
static CLIENT_ENGINE: Mutex<Option<Arc<WalkieClient>>> = Mutex::new(None);
static CURRENT_SECURITY: Mutex<Option<SecurityManager>> = Mutex::new(None);
static CURRENT_STORAGE: Mutex<Option<HostStorage>> = Mutex::new(None);

fn get_runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .expect("Failed to initialize Walkie Tokio runtime")
    })
}

struct JniClientCallbacks;

impl ClientCallbacks for JniClientCallbacks {
    fn on_connected(&self, event_id: &str, event_name: &str, channels: &[ChannelInfo], epoch: u32) {
        call_jvm(|env, obj| {
            let j_evt_id = env.new_string(event_id)?;
            let j_evt_name = env.new_string(event_name)?;
            let channels_json = serde_json::to_string(channels).unwrap_or_else(|_| "[]".into());
            let j_channels = env.new_string(channels_json)?;

            env.call_method(
                obj,
                "onConnected",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)V",
                &[
                    (&j_evt_id).into(),
                    (&j_evt_name).into(),
                    (&j_channels).into(),
                    (epoch as i32).into(),
                ],
            )?;
            Ok(())
        });
    }

    fn on_disconnected(&self, reason: &str) {
        call_jvm(|env, obj| {
            let j_reason = env.new_string(reason)?;
            env.call_method(
                obj,
                "onDisconnected",
                "(Ljava/lang/String;)V",
                &[(&j_reason).into()],
            )?;
            Ok(())
        });
    }

    fn on_floor_granted(&self, req_id: &str, channel_id: &str, lease_id: &str, epoch: u32) {
        call_jvm(|env, obj| {
            let j_req = env.new_string(req_id)?;
            let j_ch = env.new_string(channel_id)?;
            let j_lease = env.new_string(lease_id)?;

            env.call_method(
                obj,
                "onFloorGranted",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)V",
                &[
                    (&j_req).into(),
                    (&j_ch).into(),
                    (&j_lease).into(),
                    (epoch as i32).into(),
                ],
            )?;
            Ok(())
        });
    }

    fn on_floor_busy(&self, channel_id: &str, holder_name: &str) {
        call_jvm(|env, obj| {
            let j_ch = env.new_string(channel_id)?;
            let j_holder = env.new_string(holder_name)?;

            env.call_method(
                obj,
                "onFloorBusy",
                "(Ljava/lang/String;Ljava/lang/String;)V",
                &[(&j_ch).into(), (&j_holder).into()],
            )?;
            Ok(())
        });
    }

    fn on_floor_revoked(&self, channel_id: &str, lease_id: &str, reason: &str) {
        call_jvm(|env, obj| {
            let j_ch = env.new_string(channel_id)?;
            let j_lease = env.new_string(lease_id)?;
            let j_reason = env.new_string(reason)?;

            env.call_method(
                obj,
                "onFloorRevoked",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                &[(&j_ch).into(), (&j_lease).into(), (&j_reason).into()],
            )?;
            Ok(())
        });
    }

    fn on_speaker_changed(&self, channel_id: &str, speaker_id: Option<&str>, speaker_name: Option<&str>) {
        call_jvm(|env, obj| {
            let j_ch = env.new_string(channel_id)?;
            let j_spk_id = match speaker_id {
                Some(s) => env.new_string(s)?.into(),
                None => JObject::null(),
            };
            let j_spk_name = match speaker_name {
                Some(s) => env.new_string(s)?.into(),
                None => JObject::null(),
            };

            env.call_method(
                obj,
                "onSpeakerChanged",
                "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                &[(&j_ch).into(), (&j_spk_id).into(), (&j_spk_name).into()],
            )?;
            Ok(())
        });
    }

    fn on_incoming_audio_frame(&self, frame: &[u8]) {
        call_jvm(|env, obj| {
            let j_bytes = env.byte_array_from_slice(frame)?;
            env.call_method(obj, "onIncomingAudioFrame", "([B)V", &[(&j_bytes).into()])?;
            Ok(())
        });
    }

    fn on_diagnostics(&self, _diag: Diagnostics) {}
}

fn call_jvm<F>(f: F)
where
    F: FnOnce(&mut JNIEnv, &JObject) -> jni::errors::Result<()>,
{
    if let (Some(vm), Some(cb_mutex)) = (GLOBAL_VM.get(), GLOBAL_CALLBACK.get()) {
        if let Ok(guard) = cb_mutex.lock() {
            if let Some(ref global_ref) = *guard {
                if let Ok(mut env) = vm.attach_current_thread_as_daemon() {
                    let _ = f(&mut env, global_ref.as_obj());
                }
            }
        }
    }
}

// ==================== JNI EXPORTS ====================

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeInitCallbacks(
    env: JNIEnv,
    _class: JClass,
    callback_obj: JObject,
) -> jboolean {
    if let Ok(vm) = env.get_java_vm() {
        let _ = GLOBAL_VM.set(vm);
    }

    if let Ok(global_ref) = env.new_global_ref(callback_obj) {
        let cb_store = GLOBAL_CALLBACK.get_or_init(|| Mutex::new(None));
        if let Ok(mut guard) = cb_store.lock() {
            *guard = Some(global_ref);
        }
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeStartHost(
    mut env: JNIEnv,
    _class: JClass,
    base_dir: JString,
    event_name: JString,
    channels_json: JString,
    port: jint,
) -> jstring {
    let rt = get_runtime();

    let base_dir_str: String = env.get_string(&base_dir).map(|s| s.into()).unwrap_or_default();
    let event_name_str: String = env.get_string(&event_name).map(|s| s.into()).unwrap_or_else(|_| "Walkie Event".into());
    let channels_str: String = env.get_string(&channels_json).map(|s| s.into()).unwrap_or_else(|_| "[]".into());

    let channels: Vec<ChannelInfo> = serde_json::from_str(&channels_str).unwrap_or_else(|_| {
        vec![
            ChannelInfo { id: "ch_stage".into(), name: "Stage".into(), is_preset: true },
            ChannelInfo { id: "ch_prod".into(), name: "Production".into(), is_preset: true },
            ChannelInfo { id: "ch_front".into(), name: "Front Desk".into(), is_preset: true },
        ]
    });

    let storage_path = if !base_dir_str.is_empty() {
        Some(PathBuf::from(base_dir_str))
    } else {
        None
    };

    let storage = HostStorage::new(storage_path.as_deref());
    let event_id = format!("evt_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis());
    let epoch = storage.increment_epoch();
    storage.save_event(&event_id, &event_name_str, channels.clone(), epoch);

    let mut secret = vec![0u8; 32];
    for b in secret.iter_mut() {
        *b = rand::random();
    }
    let security = SecurityManager::new(secret);
    let fingerprint = security.host_fingerprint().to_string();
    let admission_token = security.generate_admission_token("crew", 24 * 3600);

    let bind_addr = format!("0.0.0.0:{}", port);
    let config = ServerConfig {
        bind_addr,
        event_id: event_id.clone(),
        event_name: event_name_str.clone(),
        channels: channels.clone(),
        security: security.clone(),
        storage: storage.clone(),
        on_speaker_changed: Some(Arc::new(|ch, spk_id, spk_name| {
            call_jvm(|env, obj| {
                let j_ch = env.new_string(ch)?;
                let j_spk_id = match spk_id {
                    Some(s) => env.new_string(s)?.into(),
                    None => JObject::null(),
                };
                let j_spk_name = match spk_name {
                    Some(s) => env.new_string(s)?.into(),
                    None => JObject::null(),
                };
                env.call_method(
                    obj,
                    "onSpeakerChanged",
                    "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                    &[(&j_ch).into(), (&j_spk_id).into(), (&j_spk_name).into()],
                )?;
                Ok(())
            });
        })),
        on_member_count_changed: Some(Arc::new(|count| {
            call_jvm(|env, obj| {
                env.call_method(obj, "onMemberCountChanged", "(I)V", &[(count as i32).into()])?;
                Ok(())
            });
        })),
    };

    let server = Arc::new(WalkieHostServer::new(config));
    let server_clone = Arc::clone(&server);

    let actual_port = match rt.block_on(async move { server_clone.start().await }) {
        Ok(p) => p,
        Err(e) => {
            let err_json = json!({ "error": e }).to_string();
            return env.new_string(err_json).unwrap().into_raw();
        }
    };

    {
        let mut s_lock = HOST_SERVER.lock().unwrap();
        *s_lock = Some(server);
        let mut sec_lock = CURRENT_SECURITY.lock().unwrap();
        *sec_lock = Some(security);
        let mut st_lock = CURRENT_STORAGE.lock().unwrap();
        *st_lock = Some(storage);
    }

    let response = json!({
        "eventId": event_id,
        "name": event_name_str,
        "port": actual_port,
        "hostFingerprint": fingerprint,
        "admissionToken": admission_token,
        "channels": channels
    }).to_string();

    env.new_string(response).unwrap().into_raw()
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeStopHost(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let mut s_lock = HOST_SERVER.lock().unwrap();
    if let Some(server) = s_lock.take() {
        server.stop();
    }
    JNI_TRUE
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeGenerateAdmissionToken(
    mut env: JNIEnv,
    _class: JClass,
    role: JString,
    ttl_hours: jlong,
) -> jstring {
    let role_str: String = env.get_string(&role).map(|s| s.into()).unwrap_or_else(|_| "crew".into());
    let ttl_seconds = (ttl_hours as u64) * 3600;

    let sec_lock = CURRENT_SECURITY.lock().unwrap();
    if let Some(ref sec) = *sec_lock {
        let token = sec.generate_admission_token(&role_str, ttl_seconds);
        env.new_string(token).unwrap().into_raw()
    } else {
        env.new_string("").unwrap().into_raw()
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeRevokeDevice(
    mut env: JNIEnv,
    _class: JClass,
    device_id: JString,
    reason: JString,
) -> jboolean {
    let dev_str: String = env.get_string(&device_id).map(|s| s.into()).unwrap_or_default();
    let reason_str: String = env.get_string(&reason).map(|s| s.into()).unwrap_or_else(|_| "Revoked by host".into());

    let rt = get_runtime();
    let s_lock = HOST_SERVER.lock().unwrap();
    if let Some(ref server) = *s_lock {
        let s_clone = Arc::clone(server);
        rt.block_on(async move {
            s_clone.revoke_device(&dev_str, &reason_str).await;
        });
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeStartClient(
    mut env: JNIEnv,
    _class: JClass,
    endpoint: JString,
    token: JString,
    device_id: JString,
    display_name: JString,
    channel_id: JString,
) -> jboolean {
    let endpoint_str: String = env.get_string(&endpoint).map(|s| s.into()).unwrap_or_default();
    let token_str: String = env.get_string(&token).map(|s| s.into()).unwrap_or_default();
    let dev_str: String = env.get_string(&device_id).map(|s| s.into()).unwrap_or_default();
    let name_str: String = env.get_string(&display_name).map(|s| s.into()).unwrap_or_default();
    let channel_str: String = env.get_string(&channel_id).map(|s| s.into()).unwrap_or_else(|_| "ch_stage".into());

    let rt = get_runtime();
    let callbacks = Arc::new(JniClientCallbacks);

    let client = Arc::new(WalkieClient::new(
        endpoint_str,
        token_str,
        dev_str,
        name_str,
        channel_str,
        callbacks,
    ));

    let client_clone = Arc::clone(&client);
    let connect_res = rt.block_on(async move {
        client_clone.connect().await
    });

    if connect_res.is_ok() {
        let mut c_lock = CLIENT_ENGINE.lock().unwrap();
        *c_lock = Some(client);
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeStopClient(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let rt = get_runtime();
    let mut c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(client) = c_lock.take() {
        rt.block_on(async move {
            client.close().await;
        });
    }
    JNI_TRUE
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeSelectChannel(
    mut env: JNIEnv,
    _class: JClass,
    channel_id: JString,
) -> jboolean {
    let ch_str: String = env.get_string(&channel_id).map(|s| s.into()).unwrap_or_default();
    let rt = get_runtime();

    let c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(ref client) = *c_lock {
        let c_clone = Arc::clone(client);
        rt.block_on(async move {
            c_clone.select_channel(&ch_str).await;
        });
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeRequestFloor(
    mut env: JNIEnv,
    _class: JClass,
    req_id: JString,
) -> jboolean {
    let req_str: String = env.get_string(&req_id).map(|s| s.into()).unwrap_or_default();
    let rt = get_runtime();

    let c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(ref client) = *c_lock {
        let c_clone = Arc::clone(client);
        rt.block_on(async move {
            c_clone.request_floor(&req_str).await;
        });
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeReleaseFloor(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    let rt = get_runtime();
    let c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(ref client) = *c_lock {
        let c_clone = Arc::clone(client);
        rt.block_on(async move {
            c_clone.release_floor().await;
        });
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeSendAudioFrame(
    env: JNIEnv,
    _class: JClass,
    audio_data: JByteArray,
    length: jint,
) -> jboolean {
    if length <= 0 {
        return JNI_FALSE;
    }

    let len = length as usize;
    let mut buf = vec![0i8; len];
    if env.get_byte_array_region(&audio_data, 0, &mut buf).is_err() {
        return JNI_FALSE;
    }

    let u8_buf = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, len) };
    let rt = get_runtime();

    let c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(ref client) = *c_lock {
        let c_clone = Arc::clone(client);
        let sent = rt.block_on(async move {
            c_clone.send_audio_frame(u8_buf).await
        });
        if sent { JNI_TRUE } else { JNI_FALSE }
    } else {
        JNI_FALSE
    }
}

#[no_mangle]
pub extern "system" fn Java_expo_modules_walkiecore_ExpoWalkieCoreNative_nativeGetDiagnostics(
    env: JNIEnv,
    _class: JClass,
) -> jstring {
    let c_lock = CLIENT_ENGINE.lock().unwrap();
    if let Some(ref client) = *c_lock {
        let diag = client.get_diagnostics();
        let diag_json = json!({
            "rttMs": diag.rtt_ms,
            "jitterMs": diag.jitter_ms,
            "packetsSent": diag.packets_sent,
            "packetsReceived": diag.packets_received
        }).to_string();
        env.new_string(diag_json).unwrap().into_raw()
    } else {
        env.new_string("{}").unwrap().into_raw()
    }
}
