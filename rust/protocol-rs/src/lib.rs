//! JS bindings for `src/protocol/`: generated from the signatures in `port.rs` by rust-anything.
//! Regenerate with `rust-anything refresh` after changing them.

use wasm_bindgen::prelude::*;

pub mod js;
pub mod port;
pub mod wire;

#[allow(unused_imports)]
use serde_json::Value;
pub mod utf16;

/// `hashChannelId`.
fn hash_channel_id_inner(channel_id: String) -> Result<f64, String> {
    let out = port::hash_channel_id(channel_id)?;
    Ok(out)
}

#[wasm_bindgen(js_name = "hashChannelId")]
pub fn hash_channel_id(channel_id: String) -> Result<f64, JsError> {
    hash_channel_id_inner(channel_id).map_err(|e| JsError::new(&e))
}

/// `packAudioFrame`.
fn pack_audio_frame_inner(
    channel_hash: f64,
    epoch: f64,
    seq: f64,
    timestamp: f64,
    payload: String,
) -> Result<String, String> {
    let payload = crate::js::from_json(&payload)?;
    let out = port::pack_audio_frame(channel_hash, epoch, seq, timestamp, payload)?;
    crate::js::to_json(&out)
}

#[wasm_bindgen(js_name = "packAudioFrame")]
pub fn pack_audio_frame(
    channel_hash: f64,
    epoch: f64,
    seq: f64,
    timestamp: f64,
    payload: String,
) -> Result<String, JsError> {
    pack_audio_frame_inner(channel_hash, epoch, seq, timestamp, payload)
        .map_err(|e| JsError::new(&e))
}

/// `unpackAudioFrame`.
fn unpack_audio_frame_inner(data: String) -> Result<String, String> {
    let data = crate::js::from_json(&data)?;
    let out = port::unpack_audio_frame(data)?;
    crate::js::to_json(&out)
}

#[wasm_bindgen(js_name = "unpackAudioFrame")]
pub fn unpack_audio_frame(data: String) -> Result<String, JsError> {
    unpack_audio_frame_inner(data).map_err(|e| JsError::new(&e))
}

// ---- the binary wire ------------------------------------------------------------------------

thread_local! {
    static WIRE_IN: std::cell::RefCell<Vec<u8>> = const { std::cell::RefCell::new(Vec::new()) };
    static WIRE_OUT: std::cell::RefCell<Vec<u8>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// This module's memory, where `index.cjs` reads and writes the wire buffers.
#[wasm_bindgen(js_name = "rustAnythingWireMemory")]
pub fn rust_anything_wire_memory() -> JsValue {
    wasm_bindgen::memory()
}

/// The address of an argument buffer of `len` bytes.
#[wasm_bindgen(js_name = "rustAnythingWireIn")]
pub fn rust_anything_wire_in(len: u32) -> u32 {
    WIRE_IN.with(|b| {
        let mut b = b.borrow_mut();
        b.resize(len as usize, 0);
        b.as_mut_ptr() as usize as u32
    })
}

/// The address of the last result.
#[wasm_bindgen(js_name = "rustAnythingWireOut")]
pub fn rust_anything_wire_out() -> u32 {
    WIRE_OUT.with(|b| b.borrow().as_ptr() as usize as u32)
}

/// Reads `len` argument bytes, runs `f`, and keeps its result for `rustAnythingWireOut`.
fn wire_io(
    len: u32,
    f: impl FnOnce(&mut wire::Reader, &mut wire::Writer) -> Result<(), String>,
) -> Result<u32, JsError> {
    let input = WIRE_IN.with(|b| std::mem::take(&mut *b.borrow_mut()));
    let mut w = wire::Writer::default();
    let result = f(
        &mut wire::Reader::new(&input[..(len as usize).min(input.len())]),
        &mut w,
    );
    WIRE_IN.with(|b| *b.borrow_mut() = input);
    match result {
        // A result of another shape than the TS type: JS runs the call through JSON.
        Err(e) if e.starts_with(wire::MISMATCH) => return Ok(u32::MAX),
        other => other.map_err(|e| JsError::new(&e))?,
    }
    let n = w.0.len();
    WIRE_OUT.with(|b| *b.borrow_mut() = w.0);
    Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

static S_PACK_AUDIO_FRAME_4: wire::Schema = wire::Schema::Dyn;
static S_PACK_AUDIO_FRAME_OUT: wire::Schema = wire::Schema::Dyn;

/// `packAudioFrame` over the binary wire.
#[wasm_bindgen(js_name = "packAudioFrameWire")]
pub fn pack_audio_frame_wire(len: u32) -> Result<u32, JsError> {
    wire_io(len, |r, w| {
        let channel_hash: f64 = r.f64()?;
        let epoch: f64 = r.f64()?;
        let seq: f64 = r.f64()?;
        let timestamp: f64 = r.f64()?;
        let payload: serde_json::Value = wire::read_value(r, &S_PACK_AUDIO_FRAME_4)?;
        let out = &port::pack_audio_frame(channel_hash, epoch, seq, timestamp, payload)?;
        wire::write_value(w, out, &S_PACK_AUDIO_FRAME_OUT)?;
        Ok(())
    })
}

static S_UNPACK_AUDIO_FRAME_0: wire::Schema = wire::Schema::Dyn;
static S_UNPACK_AUDIO_FRAME_OUT: wire::Schema = wire::Schema::Obj(&[
    (
        "header",
        wire::Schema::OptJs(&wire::Schema::Obj(&[
            ("magic", wire::Schema::Num),
            ("channelHash", wire::Schema::Num),
            ("epoch", wire::Schema::Num),
            ("seq", wire::Schema::Num),
            ("timestamp", wire::Schema::Num),
        ])),
    ),
    ("payload", wire::Schema::Dyn),
]);

/// `unpackAudioFrame` over the binary wire.
#[wasm_bindgen(js_name = "unpackAudioFrameWire")]
pub fn unpack_audio_frame_wire(len: u32) -> Result<u32, JsError> {
    wire_io(len, |r, w| {
        let data: serde_json::Value = wire::read_value(r, &S_UNPACK_AUDIO_FRAME_0)?;
        let out = &port::unpack_audio_frame(data)?;
        wire::write_value(w, out, &S_UNPACK_AUDIO_FRAME_OUT)?;
        Ok(())
    })
}
