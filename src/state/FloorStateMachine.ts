/**
 * Walkie - Floor State Machine
 * Deterministic Push-to-Talk arbitration, lease management, and safety invariants.
 */

import type { FloorState } from '../types';
import type { FloorGrantMsg, FloorBusyMsg, FloorRevokeMsg } from '../protocol/messages';

export interface FloorStateMachineCallbacks {
  onStateChanged: (newState: FloorState, previousState: FloorState) => void;
  sendFloorRequest: (channelId: string, reqId: string) => void;
  sendFloorRelease: (channelId: string, leaseId: string) => void;
  startMicrophone: () => void;
  stopMicrophone: () => void;
  playChirp: (type: 'GRANT' | 'BUSY' | 'TIMEOUT') => void;
  triggerHaptic: (type: 'GRANT' | 'BUSY' | 'RELEASE') => void;
}

export class FloorStateMachine {
  private state: FloorState = 'IDLE';
  private currentChannelId: string;
  private pendingReqId: string | null = null;
  private activeLeaseId: string | null = null;
  private activeEpoch: number = 0;
  private autoCutoffTimer: any = null;
  private autoCutoffMs: number = 30000;

  constructor(
    initialChannelId: string,
    private readonly callbacks: FloorStateMachineCallbacks,
    autoCutoffSeconds: number = 30
  ) {
    this.currentChannelId = initialChannelId;
    this.autoCutoffMs = autoCutoffSeconds * 1000;
  }

  public getState(): FloorState {
    return this.state;
  }

  public getCurrentChannelId(): string {
    return this.currentChannelId;
  }

  public getActiveLeaseId(): string | null {
    return this.activeLeaseId;
  }

  public getActiveEpoch(): number {
    return this.activeEpoch;
  }

  /**
   * User pressed PTT button (or initiated accessible Talk toggle).
   */
  public pressPtt(): boolean {
    if (this.state === 'DISCONNECTED') {
      this.callbacks.triggerHaptic('BUSY');
      return false;
    }

    if (this.state === 'BUSY') {
      this.callbacks.playChirp('BUSY');
      this.callbacks.triggerHaptic('BUSY');
      return false;
    }

    if (this.state === 'TRANSMITTING' || this.state === 'REQUESTING') {
      return false; // Already in progress
    }

    const previous = this.state;
    this.state = 'REQUESTING';
    this.pendingReqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.callbacks.onStateChanged(this.state, previous);
    this.callbacks.sendFloorRequest(this.currentChannelId, this.pendingReqId);
    return true;
  }

  /**
   * User released PTT button (or gesture cancelled, or tapped Stop in toggle mode).
   * Invariant: Microphones are stopped IMMEDIATELY and unconditionally.
   */
  public releasePtt(): void {
    this.clearAutoCutoff();

    const previous = this.state;
    const hadLease = this.activeLeaseId;
    const reqId = this.pendingReqId;

    // Reset pending state immediately so late-arriving grants are invalidated!
    this.pendingReqId = null;
    this.activeLeaseId = null;

    if (previous === 'TRANSMITTING') {
      this.callbacks.stopMicrophone();
      this.callbacks.triggerHaptic('RELEASE');
      if (hadLease) {
        this.callbacks.sendFloorRelease(this.currentChannelId, hadLease);
      }
      this.state = 'IDLE';
      this.callbacks.onStateChanged(this.state, previous);
    } else if (previous === 'REQUESTING') {
      // Early cancellation: released before grant arrived!
      this.state = 'IDLE';
      this.callbacks.onStateChanged(this.state, previous);
      // Even if reqId was pending, host will receive release or lease will be discarded
      if (reqId) {
        this.callbacks.sendFloorRelease(this.currentChannelId, `orphan_${reqId}`);
      }
    } else if (previous === 'BUSY') {
      this.state = 'IDLE';
      this.callbacks.onStateChanged(this.state, previous);
    }
  }

  /**
   * Received FLOOR_GRANT from host.
   */
  public handleFloorGrant(grant: FloorGrantMsg): void {
    // Only accept if we are currently REQUESTING and the reqId matches (if provided)
    if (
      this.state !== 'REQUESTING' ||
      (grant.reqId && this.pendingReqId && this.pendingReqId !== grant.reqId) ||
      (grant.channelId && this.currentChannelId !== grant.channelId)
    ) {
      // Stale or already released grant. Release it back to host to avoid orphan!
      this.callbacks.sendFloorRelease(grant.channelId, grant.leaseId);
      return;
    }

    const previous = this.state;
    this.state = 'TRANSMITTING';
    this.activeLeaseId = grant.leaseId;
    this.activeEpoch = grant.epoch;
    this.pendingReqId = null;

    // Play grant chirp before opening mic
    this.callbacks.playChirp('GRANT');
    this.callbacks.triggerHaptic('GRANT');
    this.callbacks.startMicrophone();
    this.callbacks.onStateChanged(this.state, previous);

    // Arm auto-cutoff timer
    const duration = Math.min(grant.maxDurationMs || 30000, this.autoCutoffMs);
    this.armAutoCutoff(duration);
  }

  /**
   * Received FLOOR_BUSY from host.
   */
  public handleFloorBusy(busy: FloorBusyMsg): void {
    if (this.pendingReqId === busy.reqId) {
      this.pendingReqId = null;
      const previous = this.state;
      this.state = 'BUSY';
      this.callbacks.playChirp('BUSY');
      this.callbacks.triggerHaptic('BUSY');
      this.callbacks.onStateChanged(this.state, previous);
    }
  }

  /**
   * Received FLOOR_REVOKE from host (e.g. timeout or organizer revoked).
   */
  public handleFloorRevoke(revoke: FloorRevokeMsg): void {
    if (
      this.activeLeaseId === revoke.leaseId ||
      this.currentChannelId === revoke.channelId
    ) {
      this.clearAutoCutoff();
      const previous = this.state;
      this.activeLeaseId = null;
      this.pendingReqId = null;
      this.callbacks.stopMicrophone();
      this.callbacks.playChirp('TIMEOUT');
      this.state = 'IDLE';
      this.callbacks.onStateChanged(this.state, previous);
    }
  }

  /**
   * Speaker changed notification (another user started or stopped speaking).
   */
  public handleSpeakerUpdate(
    channelId: string,
    speakerId: string | null,
    currentClientId: string
  ): void {
    if (channelId !== this.currentChannelId) return;

    if (speakerId && speakerId !== currentClientId) {
      if (this.state === 'IDLE' || this.state === 'REQUESTING') {
        const previous = this.state;
        this.pendingReqId = null;
        this.state = 'BUSY';
        this.callbacks.onStateChanged(this.state, previous);
      }
    } else if (!speakerId && this.state === 'BUSY') {
      const previous = this.state;
      this.state = 'IDLE';
      this.callbacks.onStateChanged(this.state, previous);
    }
  }

  /**
   * Switch selected channel. Forces listen-only and closes mic if active.
   */
  public switchChannel(newChannelId: string): void {
    if (this.currentChannelId === newChannelId) return;

    if (this.state === 'TRANSMITTING' || this.state === 'REQUESTING') {
      this.releasePtt();
    }

    this.currentChannelId = newChannelId;
    const previous = this.state;
    this.state = 'IDLE';
    this.callbacks.onStateChanged(this.state, previous);
  }

  /**
   * Audio focus lost / incoming phone call interruption.
   */
  public handleAudioInterrupt(): void {
    if (this.state === 'TRANSMITTING' || this.state === 'REQUESTING') {
      this.releasePtt();
    }
  }

  /**
   * Connection lost to host.
   */
  public handleConnectionLost(): void {
    this.clearAutoCutoff();
    if (this.state === 'TRANSMITTING') {
      this.callbacks.stopMicrophone();
    }
    this.pendingReqId = null;
    this.activeLeaseId = null;
    const previous = this.state;
    this.state = 'DISCONNECTED';
    this.callbacks.onStateChanged(this.state, previous);
  }

  /**
   * Connection restored. Invariant: always resume in IDLE (listen-only).
   */
  public handleConnectionRestored(): void {
    this.clearAutoCutoff();
    this.pendingReqId = null;
    this.activeLeaseId = null;
    const previous = this.state;
    this.state = 'IDLE';
    this.callbacks.onStateChanged(this.state, previous);
  }

  private armAutoCutoff(durationMs: number): void {
    this.clearAutoCutoff();
    this.autoCutoffTimer = setTimeout(() => {
      if (this.state === 'TRANSMITTING') {
        this.releasePtt();
        this.callbacks.playChirp('TIMEOUT');
      }
    }, durationMs);
  }

  private clearAutoCutoff(): void {
    if (this.autoCutoffTimer) {
      clearTimeout(this.autoCutoffTimer);
      this.autoCutoffTimer = null;
    }
  }

  public setAutoCutoffSeconds(seconds: number): void {
    this.autoCutoffMs = Math.max(5, seconds) * 1000;
  }
}
