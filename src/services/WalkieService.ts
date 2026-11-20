/**
 * WalkieService - Core Application Service
 * Coordinates between React Native UI, FloorStateMachine, and ExpoWalkieCoreModule.
 */

import { EventEmitter } from 'expo-modules-core';
import ExpoWalkieCoreModule from 'expo-walkie-core';
import {
  Channel,
  ConnectionState,
  EventConfig,
  FloorState,
  AudioSettings,
  NetworkDiagnostics,
  WalkieRole,
  ConnectedMember,
} from '../types';
import { FloorStateMachine } from '../state/FloorStateMachine';
import * as Haptics from 'expo-haptics';

export type WalkieListener = () => void;

class WalkieService {
  private static instance: WalkieService;

  public role: WalkieRole | null = null;
  public connectionState: ConnectionState = 'OFFLINE';
  public floorState: FloorState = 'IDLE';
  public activeSpeaker: string | null = null;
  public isLocked: boolean = false;
  public clientId: string = 'me';
  public currentChannel: Channel = { id: 'ch_all', name: 'General (All Call)', isPreset: true, isAllCall: true };
  public channels: Channel[] = [
    { id: 'ch_all', name: 'General (All Call)', isPreset: true, isAllCall: true },
    { id: 'ch_stage', name: 'Stage', isPreset: true },
    { id: 'ch_prod', name: 'Production', isPreset: true },
    { id: 'ch_front', name: 'Front Desk', isPreset: true },
  ];
  public eventConfig: EventConfig | null = null;
  public connectedMemberCount: number = 0;

  public audioSettings: AudioSettings = {
    route: 'SPEAKER',
    chirpsEnabled: true,
    hapticsEnabled: true,
    accessibilityPttMode: 'HOLD',
    autoCutoffSeconds: 30,
  };

  public diagnostics: NetworkDiagnostics = {
    localIp: '127.0.0.1',
    hostEndpoint: 'Offline',
    rttMs: 0,
    packetLossRate: 0.0,
    packetsSent: 0,
    packetsReceived: 0,
    jitterMs: 0.0,
    lastGrantLatencyMs: 0,
  };

  private fsm: FloorStateMachine;
  private listeners = new Set<WalkieListener>();
  private nativeSubscriptions: any[] = [];

  private constructor() {
    try {
      this.clientId = ExpoWalkieCoreModule.getClientId() || 'me';
    } catch (e) {
      this.clientId = 'me';
    }

    this.fsm = new FloorStateMachine(
      this.currentChannel.id,
      {
        onStateChanged: (newState) => {
          this.floorState = newState;
          this.notify();
        },
        sendFloorRequest: (channelId, reqId) => {
          try {
            ExpoWalkieCoreModule.requestFloor(reqId);
          } catch (e) {
            console.warn('[WalkieService] Failed to request floor:', e);
          }
        },
        sendFloorRelease: () => {
          try {
            ExpoWalkieCoreModule.releaseFloor();
          } catch (e) {
            console.warn('[WalkieService] Failed to release floor:', e);
          }
        },
        startMicrophone: () => {
          // Native module starts microphone automatically upon floor grant
        },
        stopMicrophone: () => {
          try {
            ExpoWalkieCoreModule.releaseFloor();
          } catch (ignored) {}
        },
        playChirp: (type) => {
          if (this.audioSettings.chirpsEnabled) {
            try {
              ExpoWalkieCoreModule.playChirp(type);
            } catch (ignored) {}
          }
        },
        triggerHaptic: (type) => {
          if (this.audioSettings.hapticsEnabled) {
            this.runHaptic(type);
          }
        },
      },
      this.audioSettings.autoCutoffSeconds
    );

    this.setupNativeSubscriptions();
  }

  public static getInstance(): WalkieService {
    if (!WalkieService.instance) {
      WalkieService.instance = new WalkieService();
    }
    return WalkieService.instance;
  }

  private setupNativeSubscriptions(): void {
    try {
      const emitter: any = new EventEmitter(ExpoWalkieCoreModule as any);

      this.nativeSubscriptions.push(
        emitter.addListener('onNetworkStatusUpdate', (event: any) => {
          if (event.connected) {
            this.connectionState = 'CONNECTED';
            this.fsm.handleConnectionRestored();
          } else {
            this.connectionState = event.reason ? 'HOST_STOPPED' : 'RECONNECTING';
            this.fsm.handleConnectionLost();
          }
          this.notify();
        })
      );

      this.nativeSubscriptions.push(
        emitter.addListener('onFloorChange', (event: any) => {
          if (event.floorState === 'TRANSMITTING') {
            this.floorState = 'TRANSMITTING';
            this.fsm.handleFloorGrant({
              type: 'FLOOR_GRANT',
              reqId: event.reqId || '',
              channelId: event.channelId || this.currentChannel.id,
              leaseId: event.leaseId || 'native_lease',
              epoch: 1,
              grantedTo: this.clientId,
              speakerName: 'Me',
              maxDurationMs: 30000,
            });
          } else if (event.floorState === 'BUSY') {
            if (event.speakerId && event.speakerId === this.clientId) {
              return;
            }
            this.fsm.handleFloorBusy({
              type: 'FLOOR_BUSY',
              reqId: event.reqId || '',
              channelId: event.channelId || this.currentChannel.id,
              holderId: event.speakerId || 'other',
              holderName: event.holderName || 'Another Crew Member',
            });
          } else if (event.floorState === 'IDLE') {
            this.floorState = 'IDLE';
            this.fsm.releasePtt();
          }
          this.notify();
        })
      );

      this.nativeSubscriptions.push(
        emitter.addListener('onSpeakerChange', (event: any) => {
          const isRelevantChannel =
            event.channelId === this.currentChannel.id ||
            event.channelId === 'ch_all';

          if (isRelevantChannel) {
            const isMe = event.speakerId && event.speakerId === this.clientId;
            if (isMe) {
              return;
            }
            this.activeSpeaker = event.speakerName || null;
            this.fsm.handleSpeakerUpdate(
              event.channelId,
              event.speakerId,
              this.clientId
            );
            this.notify();
          }
        })
      );

      this.nativeSubscriptions.push(
        emitter.addListener('onChannelLocked', (event: any) => {
          const targetCh = this.channels.find(c => c.id === event.channelId) || {
            id: event.channelId,
            name: event.channelName || event.channelId,
            isPreset: true,
          };
          this.isLocked = !!event.locked;
          this.currentChannel = {
            ...targetCh,
            isLocked: this.isLocked,
          };
          this.fsm.switchChannel(this.currentChannel.id);
          this.notify();
        })
      );

      this.nativeSubscriptions.push(
        emitter.addListener('onChannelListUpdate', (event: any) => {
          if (Array.isArray(event.channels) && event.channels.length > 0) {
            this.channels = event.channels;
            const currentStillValid = this.channels.find(
              (c) => c.id === this.currentChannel.id
            );
            if (!currentStillValid) {
              this.currentChannel = this.channels[0];
              this.fsm.switchChannel(this.currentChannel.id);
            }
            this.notify();
          }
        })
      );

      this.nativeSubscriptions.push(
        emitter.addListener('onMemberUpdate', (event: any) => {
          this.connectedMemberCount = event.connectedCount || 0;
          this.notify();
        })
      );
    } catch (e) {
      console.warn('[WalkieService] Native event subscriptions failed, running preview fallback:', e);
    }
  }

  // --- Core PTT Actions ---

  public pttPress(): void {
    if (this.connectionState !== 'CONNECTED') return;
    this.fsm.pressPtt();
  }

  public pttRelease(): void {
    this.fsm.releasePtt();
  }

  public switchChannel(direction: 'next' | 'prev'): void {
    if (this.isLocked) {
      this.runHaptic('BUSY');
      return;
    }
    if (this.channels.length === 0) return;
    const currentIndex = this.channels.findIndex((c) => c.id === this.currentChannel.id);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (nextIndex >= this.channels.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = this.channels.length - 1;

    const newChannel = this.channels[nextIndex];
    this.selectChannel(newChannel.id);
  }

  public selectChannel(channelId: string): void {
    if (this.isLocked) {
      this.runHaptic('BUSY');
      return;
    }
    const target = this.channels.find((c) => c.id === channelId);
    if (!target || target.id === this.currentChannel.id) return;

    this.currentChannel = target;
    this.activeSpeaker = null;
    this.fsm.switchChannel(channelId);

    try {
      ExpoWalkieCoreModule.selectChannel(channelId);
    } catch (e) {
      console.warn('[WalkieService] selectChannel native error:', e);
    }
    this.notify();
  }

  // --- Event Lifecycle ---

  public async startHost(
    eventName: string,
    initialChannels: Channel[] = this.channels
  ): Promise<EventConfig> {
    this.role = 'organizer';
    this.connectionState = 'CONNECTING';
    this.notify();

    try {
      const config = await ExpoWalkieCoreModule.startHost(
        eventName,
        JSON.stringify(initialChannels)
      );

      this.eventConfig = config;
      this.channels = config.channels;
      this.currentChannel = this.channels[0] || this.currentChannel;
      this.connectionState = 'CONNECTED';
      this.fsm.switchChannel(this.currentChannel.id);
      this.notify();
      return config;
    } catch (error) {
      this.connectionState = 'OFFLINE';
      this.role = null;
      this.notify();
      throw error;
    }
  }

  public async stopHost(): Promise<void> {
    try {
      await ExpoWalkieCoreModule.stopHost();
    } finally {
      this.role = null;
      this.eventConfig = null;
      this.connectionState = 'OFFLINE';
      this.activeSpeaker = null;
      this.fsm.handleConnectionLost();
      this.notify();
    }
  }

  public async joinEvent(
    endpoint: string,
    token: string,
    hostFingerprint: string,
    displayName: string,
    channelId: string = 'ch_stage'
  ): Promise<void> {
    this.role = 'crew';
    this.connectionState = 'CONNECTING';
    this.notify();

    try {
      await ExpoWalkieCoreModule.joinEvent(
        endpoint,
        token,
        hostFingerprint,
        displayName,
        channelId
      );

      this.connectionState = 'CONNECTED';
      this.currentChannel =
        this.channels.find((c) => c.id === channelId) || this.channels[0];
      this.fsm.switchChannel(this.currentChannel.id);
      this.notify();
    } catch (error) {
      this.connectionState = 'OFFLINE';
      this.role = null;
      this.notify();
      throw error;
    }
  }

  public async leaveEvent(): Promise<void> {
    try {
      await ExpoWalkieCoreModule.leaveEvent();
    } finally {
      this.role = null;
      this.eventConfig = null;
      this.connectionState = 'OFFLINE';
      this.activeSpeaker = null;
      this.fsm.handleConnectionLost();
      this.notify();
    }
  }

  // --- Settings & Diagnostics ---

  public setAudioRoute(route: 'SPEAKER' | 'EARPIECE' | 'BLUETOOTH'): void {
    this.audioSettings.route = route;
    try {
      ExpoWalkieCoreModule.setAudioRoute(route);
    } catch (ignored) {}
    this.notify();
  }

  public toggleChirps(): void {
    this.audioSettings.chirpsEnabled = !this.audioSettings.chirpsEnabled;
    this.notify();
  }

  public toggleHaptics(): void {
    this.audioSettings.hapticsEnabled = !this.audioSettings.hapticsEnabled;
    this.notify();
  }

  public setAccessibilityMode(mode: 'HOLD' | 'TAP_TOGGLE'): void {
    this.audioSettings.accessibilityPttMode = mode;
    this.notify();
  }

  public refreshDiagnostics(): NetworkDiagnostics {
    try {
      const diag = ExpoWalkieCoreModule.getDiagnostics();
      this.diagnostics = diag;
    } catch (ignored) {}
    this.notify();
    return this.diagnostics;
  }

  public rotateInviteToken(): string {
    try {
      const newToken = ExpoWalkieCoreModule.rotateAdmissionToken();
      if (this.eventConfig) {
        this.eventConfig.admissionToken = newToken;
      }
      this.notify();
      return newToken;
    } catch (e) {
      return '';
    }
  }

  public revokeMember(clientId: string, reason: string = 'Revoked by organizer'): void {
    try {
      ExpoWalkieCoreModule.revokeMember(clientId, reason);
    } catch (ignored) {}
  }

  public lockMemberChannel(targetDeviceId: string, channelId: string | null, locked: boolean): boolean {
    try {
      return ExpoWalkieCoreModule.lockMemberChannel(targetDeviceId, channelId, locked);
    } catch (e) {
      console.warn('[WalkieService] Failed to lock member channel:', e);
      return false;
    }
  }

  public getConnectedMembers(): ConnectedMember[] {
    try {
      const list = ExpoWalkieCoreModule.getConnectedMembers();
      return (list || []).map((m: any) => ({
        id: m.deviceId,
        displayName: m.displayName || 'Crew Member',
        channelId: m.channelId,
        lockedChannel: m.lockedChannel,
        role: m.role || 'crew',
        connectedAt: Date.now(),
        ipAddress: '192.168.x.x',
        isRevoked: false,
        lastPingAt: Date.now(),
      }));
    } catch (e) {
      return [];
    }
  }

  // --- Subscriptions ---

  public subscribe(listener: WalkieListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private runHaptic(type: 'GRANT' | 'BUSY' | 'RELEASE'): void {
    try {
      switch (type) {
        case 'GRANT':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'BUSY':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case 'RELEASE':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
      }
    } catch (ignored) {}
  }
}

export default WalkieService;
