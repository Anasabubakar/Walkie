//! Walkie Security & Cryptographic Token Management

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct SecurityManager {
    secret_key: Vec<u8>,
    fingerprint: String,
}

impl SecurityManager {
    pub fn new(secret_key: Vec<u8>) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(&secret_key);
        hasher.update(b"WALKIE_HOST_IDENTITY_V1");
        let hash = hasher.finalize();
        let fingerprint = hex::encode_upper(hash);

        Self {
            secret_key,
            fingerprint,
        }
    }

    pub fn host_fingerprint(&self) -> &str {
        &self.fingerprint
    }

    pub fn generate_admission_token(&self, role: &str, ttl_seconds: u64) -> String {
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let expires_at = now_sec + ttl_seconds;
        let nonce: u64 = rand::random();

        let message = format!("{}.{}.{:x}", role, expires_at, nonce);

        let mut mac = HmacSha256::new_from_slice(&self.secret_key)
            .expect("HMAC can take key of any size");
        mac.update(message.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        format!("{}.{}", message, signature)
    }

    pub fn verify_admission_token(&self, token: &str) -> Result<String, &'static str> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 4 {
            return Err("Invalid token format");
        }

        let role = parts[0];
        let expires_at: u64 = parts[1].parse().map_err(|_| "Invalid token expiry")?;
        let nonce = parts[2];
        let sig_hex = parts[3];

        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if now_sec > expires_at {
            return Err("Token expired");
        }

        let message = format!("{}.{}.{}", role, expires_at, nonce);
        let mut mac = HmacSha256::new_from_slice(&self.secret_key)
            .expect("HMAC can take key of any size");
        mac.update(message.as_bytes());

        let expected_bytes = mac.finalize().into_bytes();
        let sig_bytes = hex::decode(sig_hex).map_err(|_| "Invalid token signature hex")?;

        // Constant time comparison
        if expected_bytes.as_slice() != sig_bytes.as_slice() {
            return Err("Token signature mismatch");
        }

        Ok(role.to_string())
    }
}
