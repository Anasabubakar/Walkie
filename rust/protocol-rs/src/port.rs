//! The Rust port of `src/protocol/`.

#![forbid(unsafe_code)]

use serde_json::{json, Value};

/// 16-bit short hash for channel string to pack into binary audio header.
pub fn hash_channel_id(channel_id: String) -> Result<f64, String> {
    let mut hash: u32 = 0x811c_9dc5;
    for code_unit in channel_id.encode_utf16() {
        hash ^= code_unit as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    let res = (hash ^ (hash >> 16)) & 0xffff;
    Ok(res as f64)
}

fn to_int32(val: f64) -> i32 {
    if val.is_nan() || val.is_infinite() || val == 0.0 {
        0
    } else {
        let f = val.trunc();
        (f % 4294967296.0) as i64 as i32
    }
}

fn to_uint32(val: f64) -> u32 {
    to_int32(val) as u32
}

fn parse_js_number(val: &Value) -> f64 {
    match val {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::Object(o) => {
            if let Some(Value::String(s)) = o.get("$num") {
                match s.as_str() {
                    "NaN" => f64::NAN,
                    "Infinity" => f64::INFINITY,
                    "-Infinity" => f64::NEG_INFINITY,
                    "-0" => -0.0,
                    _ => 0.0,
                }
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}

fn extract_payload_bytes(payload: &Value) -> Result<Vec<u8>, String> {
    match payload {
        Value::Object(o) => {
            if let Some(Value::Array(arr)) = o.get("$bytes") {
                let bytes: Vec<u8> = arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect();
                Ok(bytes)
            } else {
                Err("offset is out of bounds".to_string())
            }
        }
        Value::Array(arr) => {
            let bytes: Vec<u8> = arr
                .iter()
                .map(|v| match v {
                    Value::Number(n) => (n.as_f64().unwrap_or(0.0).trunc() as i64 as u8),
                    _ => 0,
                })
                .collect();
            Ok(bytes)
        }
        Value::String(s) => {
            // In JS frame.set("x", 15) treats string as array of chars converted to number (NaN -> 0)
            Ok(vec![0; s.len()])
        }
        _ => Err("offset is out of bounds".to_string()),
    }
}

/// Port of `packAudioFrame` (`src/protocol/messages.ts:164`).
pub fn pack_audio_frame(
    channel_hash: f64,
    epoch: f64,
    seq: f64,
    timestamp: f64,
    payload: Value,
) -> Result<Value, String> {
    let payload_bytes = extract_payload_bytes(&payload)?;

    let ch_int = to_int32(channel_hash);
    let epoch_u = to_uint32(epoch);
    let seq_u = to_uint32(seq);
    let ts_u = to_uint32(timestamp);

    let mut frame = Vec::with_capacity(15 + payload_bytes.len());
    frame.push(0xa0); // Magic

    // Channel hash (16-bit BE)
    frame.push(((ch_int >> 8) & 0xff) as u8);
    frame.push((ch_int & 0xff) as u8);

    // Epoch (32-bit BE)
    frame.push(((epoch_u >> 24) & 0xff) as u8);
    frame.push(((epoch_u >> 16) & 0xff) as u8);
    frame.push(((epoch_u >> 8) & 0xff) as u8);
    frame.push((epoch_u & 0xff) as u8);

    // Seq (32-bit BE)
    frame.push(((seq_u >> 24) & 0xff) as u8);
    frame.push(((seq_u >> 16) & 0xff) as u8);
    frame.push(((seq_u >> 8) & 0xff) as u8);
    frame.push((seq_u & 0xff) as u8);

    // Timestamp (32-bit BE)
    frame.push(((ts_u >> 24) & 0xff) as u8);
    frame.push(((ts_u >> 16) & 0xff) as u8);
    frame.push(((ts_u >> 8) & 0xff) as u8);
    frame.push((ts_u & 0xff) as u8);

    frame.extend(payload_bytes);

    let bytes_val: Vec<Value> = frame.into_iter().map(|b| json!(b)).collect();
    Ok(json!({ "$bytes": bytes_val }))
}

/// Port of `unpackAudioFrame` (`src/protocol/messages.ts:203`).
pub fn unpack_audio_frame(data: Value) -> Result<Value, String> {
    if data.is_null() {
        return Err("Cannot read properties of null (reading 'length')".to_string());
    }

    let bytes_opt = match &data {
        Value::Object(o) => {
            if let Some(Value::Array(arr)) = o.get("$bytes") {
                let bytes: Vec<u8> = arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect();
                Some(bytes)
            } else {
                None
            }
        }
        Value::Array(arr) => {
            let bytes: Vec<u8> = arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect();
            Some(bytes)
        }
        _ => None,
    };

    let bytes = match bytes_opt {
        Some(b) => b,
        None => {
            return Ok(json!({
                "header": Value::Null,
                "payload": { "$bytes": [] }
            }));
        }
    };

    if bytes.len() < 15 || bytes[0] != 0xa0 {
        return Ok(json!({
            "header": Value::Null,
            "payload": { "$bytes": [] }
        }));
    }

    let channel_hash = ((bytes[1] as u32) << 8) | (bytes[2] as u32);
    let epoch = ((bytes[3] as u32) << 24)
        | ((bytes[4] as u32) << 16)
        | ((bytes[5] as u32) << 8)
        | (bytes[6] as u32);
    let seq = ((bytes[7] as u32) << 24)
        | ((bytes[8] as u32) << 16)
        | ((bytes[9] as u32) << 8)
        | (bytes[10] as u32);
    let timestamp = ((bytes[11] as u32) << 24)
        | ((bytes[12] as u32) << 16)
        | ((bytes[13] as u32) << 8)
        | (bytes[14] as u32);

    let payload: Vec<Value> = bytes[15..].iter().map(|b| json!(b)).collect();

    Ok(json!({
        "header": {
            "magic": 160,
            "channelHash": channel_hash,
            "epoch": epoch,
            "seq": seq,
            "timestamp": timestamp,
        },
        "payload": { "$bytes": payload }
    }))
}
