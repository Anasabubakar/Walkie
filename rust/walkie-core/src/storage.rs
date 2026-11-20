//! Walkie Host Persistent Storage
//! Manages event settings, channels, epoch, and revoked devices with atomic persistence.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::protocol::ChannelInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub event_id: String,
    pub name: String,
    pub channels: Vec<ChannelInfo>,
    pub epoch: u32,
    #[serde(default)]
    pub revoked_devices: HashSet<String>,
}

#[derive(Debug, Clone)]
pub struct HostStorage {
    file_path: Option<PathBuf>,
    current_record: Arc<Mutex<Option<EventRecord>>>,
}

impl HostStorage {
    pub fn new(base_dir: Option<&Path>) -> Self {
        let file_path = base_dir.map(|p| p.join("walkie_event_record.json"));
        let mut initial_record = None;

        if let Some(ref path) = file_path {
            if path.exists() {
                if let Ok(file) = File::open(path) {
                    let reader = BufReader::new(file);
                    if let Ok(record) = serde_json::from_reader(reader) {
                        initial_record = Some(record);
                    }
                }
            }
        }

        Self {
            file_path,
            current_record: Arc::new(Mutex::new(initial_record)),
        }
    }

    pub fn save_event(&self, event_id: &str, name: &str, channels: Vec<ChannelInfo>, epoch: u32) {
        let record = EventRecord {
            event_id: event_id.to_string(),
            name: name.to_string(),
            channels,
            epoch,
            revoked_devices: HashSet::new(),
        };

        {
            let mut lock = self.current_record.lock().unwrap();
            *lock = Some(record.clone());
        }

        self.persist_to_disk(&record);
    }

    pub fn get_event(&self) -> Option<EventRecord> {
        let lock = self.current_record.lock().unwrap();
        lock.clone()
    }

    pub fn increment_epoch(&self) -> u32 {
        let mut lock = self.current_record.lock().unwrap();
        if let Some(ref mut record) = *lock {
            record.epoch = record.epoch.wrapping_add(1);
            let ep = record.epoch;
            let record_clone = record.clone();
            drop(lock);
            self.persist_to_disk(&record_clone);
            ep
        } else {
            1
        }
    }

    pub fn revoke_device(&self, device_id: &str) {
        let mut lock = self.current_record.lock().unwrap();
        if let Some(ref mut record) = *lock {
            record.revoked_devices.insert(device_id.to_string());
            let record_clone = record.clone();
            drop(lock);
            self.persist_to_disk(&record_clone);
        }
    }

    pub fn is_device_revoked(&self, device_id: &str) -> bool {
        let lock = self.current_record.lock().unwrap();
        if let Some(ref record) = *lock {
            record.revoked_devices.contains(device_id)
        } else {
            false
        }
    }

    pub fn clear(&self) {
        {
            let mut lock = self.current_record.lock().unwrap();
            *lock = None;
        }
        if let Some(ref path) = self.file_path {
            let _ = fs::remove_file(path);
        }
    }

    fn persist_to_disk(&self, record: &EventRecord) {
        if let Some(ref path) = self.file_path {
            let temp_path = path.with_extension("tmp");
            if let Ok(file) = File::create(&temp_path) {
                let mut writer = BufWriter::new(file);
                if serde_json::to_writer(&mut writer, record).is_ok() {
                    let _ = writer.flush();
                    let _ = fs::rename(&temp_path, path);
                } else {
                    let _ = fs::remove_file(&temp_path);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("walkie_test_{}", rand::random::<u64>()));
        let _ = fs::create_dir_all(&temp_dir);

        let storage = HostStorage::new(Some(&temp_dir));
        assert!(storage.get_event().is_none());

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

        storage.save_event("evt_123", "Test Event", channels.clone(), 1);
        let event = storage.get_event().expect("Event should exist");
        assert_eq!(event.event_id, "evt_123");
        assert_eq!(event.channels.len(), 2);
        assert_eq!(event.epoch, 1);

        assert_eq!(storage.increment_epoch(), 2);
        assert!(!storage.is_device_revoked("dev_bad"));
        storage.revoke_device("dev_bad");
        assert!(storage.is_device_revoked("dev_bad"));

        // Test persistence reload
        let storage2 = HostStorage::new(Some(&temp_dir));
        let event2 = storage2.get_event().expect("Event should reload from disk");
        assert_eq!(event2.epoch, 2);
        assert!(storage2.is_device_revoked("dev_bad"));

        storage2.clear();
        assert!(storage2.get_event().is_none());
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
