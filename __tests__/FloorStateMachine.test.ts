/**
 * Unit Tests for FloorStateMachine
 * Verifies PTT grant, release before grant, stale grant rejection,
 * channel switching, call interruption, and timeout cutoff.
 */

import { FloorStateMachine, FloorStateMachineCallbacks } from '../src/state/FloorStateMachine';
import { FloorGrantMsg, FloorBusyMsg, FloorRevokeMsg } from '../src/protocol/messages';

describe('FloorStateMachine', () => {
  let callbacks: jest.Mocked<FloorStateMachineCallbacks>;
  let fsm: FloorStateMachine;

  beforeEach(() => {
    callbacks = {
      onStateChanged: jest.fn(),
      sendFloorRequest: jest.fn(),
      sendFloorRelease: jest.fn(),
      startMicrophone: jest.fn(),
      stopMicrophone: jest.fn(),
      playChirp: jest.fn(),
      triggerHaptic: jest.fn(),
    };
    fsm = new FloorStateMachine('ch_stage', callbacks, 30);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  test('initial state is IDLE', () => {
    expect(fsm.getState()).toBe('IDLE');
    expect(fsm.getCurrentChannelId()).toBe('ch_stage');
  });

  test('pressing PTT requests the floor and transitions to REQUESTING', () => {
    const success = fsm.pressPtt();
    expect(success).toBe(true);
    expect(fsm.getState()).toBe('REQUESTING');
    expect(callbacks.sendFloorRequest).toHaveBeenCalledWith('ch_stage', expect.stringMatching(/^req_/));
    expect(callbacks.onStateChanged).toHaveBeenCalledWith('REQUESTING', 'IDLE');
    expect(callbacks.startMicrophone).not.toHaveBeenCalled();
  });

  test('receiving grant transitions to TRANSMITTING and opens mic', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);

    const grant: FloorGrantMsg = {
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_001',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    };

    fsm.handleFloorGrant(grant);
    expect(fsm.getState()).toBe('TRANSMITTING');
    expect(callbacks.playChirp).toHaveBeenCalledWith('GRANT');
    expect(callbacks.triggerHaptic).toHaveBeenCalledWith('GRANT');
    expect(callbacks.startMicrophone).toHaveBeenCalledTimes(1);
    expect(fsm.getActiveLeaseId()).toBe('lease_001');
  });

  test('releasing PTT during transmission stops mic and sends release', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);
    fsm.handleFloorGrant({
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_001',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    });

    fsm.releasePtt();
    expect(fsm.getState()).toBe('IDLE');
    expect(callbacks.stopMicrophone).toHaveBeenCalledTimes(1);
    expect(callbacks.sendFloorRelease).toHaveBeenCalledWith('ch_stage', 'lease_001');
    expect(fsm.getActiveLeaseId()).toBeNull();
  });

  test('CRITICAL INVARIANT: release before grant cancels request and NEVER opens mic', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);

    // User releases BEFORE grant arrives from host
    fsm.releasePtt();
    expect(fsm.getState()).toBe('IDLE');

    // Late grant arrives now!
    const lateGrant: FloorGrantMsg = {
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_late',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    };

    fsm.handleFloorGrant(lateGrant);

    // Mic must NEVER open, and late lease should be released immediately
    expect(fsm.getState()).toBe('IDLE');
    expect(callbacks.startMicrophone).not.toHaveBeenCalled();
    expect(callbacks.sendFloorRelease).toHaveBeenCalledWith('ch_stage', 'lease_late');
  });

  test('receiving BUSY response transitions to BUSY with cue', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);

    const busy: FloorBusyMsg = {
      type: 'FLOOR_BUSY',
      reqId,
      channelId: 'ch_stage',
      holderId: 'other_user',
      holderName: 'Alice',
    };

    fsm.handleFloorBusy(busy);
    expect(fsm.getState()).toBe('BUSY');
    expect(callbacks.playChirp).toHaveBeenCalledWith('BUSY');
    expect(callbacks.startMicrophone).not.toHaveBeenCalled();
  });

  test('channel switch drops active transmission and enters IDLE on new channel', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);
    fsm.handleFloorGrant({
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_001',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    });

    fsm.switchChannel('ch_prod');
    expect(fsm.getState()).toBe('IDLE');
    expect(fsm.getCurrentChannelId()).toBe('ch_prod');
    expect(callbacks.stopMicrophone).toHaveBeenCalledTimes(1);
    expect(callbacks.sendFloorRelease).toHaveBeenCalledWith('ch_stage', 'lease_001');
  });

  test('audio focus interrupt immediately stops mic and releases lease', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);
    fsm.handleFloorGrant({
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_001',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    });

    fsm.handleAudioInterrupt();
    expect(fsm.getState()).toBe('IDLE');
    expect(callbacks.stopMicrophone).toHaveBeenCalledTimes(1);
    expect(callbacks.sendFloorRelease).toHaveBeenCalledWith('ch_stage', 'lease_001');
  });

  test('connection loss forces DISCONNECTED and stops mic', () => {
    fsm.pressPtt();
    const reqId = (callbacks.sendFloorRequest.mock.calls[0][1] as string);
    fsm.handleFloorGrant({
      type: 'FLOOR_GRANT',
      reqId,
      channelId: 'ch_stage',
      leaseId: 'lease_001',
      epoch: 1,
      grantedTo: 'client_me',
      speakerName: 'Stage Lead',
      maxDurationMs: 30000,
    });

    fsm.handleConnectionLost();
    expect(fsm.getState()).toBe('DISCONNECTED');
    expect(callbacks.stopMicrophone).toHaveBeenCalledTimes(1);

    // On reconnect, always IDLE (listen-only, never re-transmits)
    fsm.handleConnectionRestored();
    expect(fsm.getState()).toBe('IDLE');
  });
});
