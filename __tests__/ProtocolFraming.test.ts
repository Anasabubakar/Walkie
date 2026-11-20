/**
 * Unit Tests for Binary Audio Framing & Wire Protocol Messages
 */

import {
  hashChannelId,
  packAudioFrame,
  unpackAudioFrame,
  AUDIO_FRAME_MAGIC,
  AUDIO_HEADER_SIZE,
} from '../src/protocol/messages';

describe('Binary Audio Framing Protocol', () => {
  test('channel ID hashing is deterministic and produces 16-bit hash', () => {
    const hashStage = hashChannelId('ch_stage');
    const hashStage2 = hashChannelId('ch_stage');
    const hashProd = hashChannelId('ch_prod');

    expect(hashStage).toBe(hashStage2);
    expect(hashStage).not.toBe(hashProd);
    expect(hashStage).toBeGreaterThanOrEqual(0);
    expect(hashStage).toBeLessThanOrEqual(0xffff);
  });

  test('packAudioFrame and unpackAudioFrame correctly encode and decode binary packets', () => {
    const channelHash = hashChannelId('ch_stage');
    const epoch = 42;
    const seq = 1001;
    const timestamp = 1700000000;
    const samplePcm = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    const frame = packAudioFrame(channelHash, epoch, seq, timestamp, samplePcm);

    expect(frame.length).toBe(AUDIO_HEADER_SIZE + samplePcm.length);
    expect(frame[0]).toBe(AUDIO_FRAME_MAGIC);

    const { header, payload } = unpackAudioFrame(frame);

    expect(header).not.toBeNull();
    expect(header?.magic).toBe(AUDIO_FRAME_MAGIC);
    expect(header?.channelHash).toBe(channelHash);
    expect(header?.epoch).toBe(epoch);
    expect(header?.seq).toBe(seq);
    expect(header?.timestamp).toBe(timestamp);

    expect(payload.length).toBe(samplePcm.length);
    expect(Array.from(payload)).toEqual(Array.from(samplePcm));
  });

  test('unpackAudioFrame returns null header for truncated or corrupted data', () => {
    const corrupted = new Uint8Array([0x12, 0x34]); // Too short and wrong magic
    const { header, payload } = unpackAudioFrame(corrupted);
    expect(header).toBeNull();
    expect(payload.length).toBe(0);
  });
});
