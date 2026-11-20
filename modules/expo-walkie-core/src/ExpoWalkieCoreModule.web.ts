import { registerWebModule, NativeModule } from 'expo';
import {
  ChannelPayload,
  DiagnosticsPayload,
  EventConfigPayload,
  FloorChangeEvent,
  NetworkStatusUpdateEvent,
  SpeakerChangeEvent,
  StateChangeEvent,
  ChannelListUpdateEvent,
  MemberUpdateEvent,
} from './ExpoWalkieCore.types';

class ExpoWalkieCoreModuleWeb extends NativeModule<{
  onStateChange: (event: StateChangeEvent) => void;
  onFloorChange: (event: FloorChangeEvent) => void;
  onSpeakerChange: (event: SpeakerChangeEvent) => void;
  onChannelListUpdate: (event: ChannelListUpdateEvent) => void;
  onNetworkStatusUpdate: (event: NetworkStatusUpdateEvent) => void;
  onMemberUpdate: (event: MemberUpdateEvent) => void;
}> {
  private activeConfig: EventConfigPayload | null = null;
  private currentChannel: string = 'ch_stage';
  private isTransmitting: boolean = false;

  async startHost(eventName: string, channelsJson: string): Promise<EventConfigPayload> {
    const channels: ChannelPayload[] = JSON.parse(channelsJson || '[]');
    const presetChannels = channels.length > 0 ? channels : [
      { id: 'ch_stage', name: 'Stage', isPreset: true },
      { id: 'ch_prod', name: 'Production', isPreset: true },
      { id: 'ch_front', name: 'Front Desk', isPreset: true },
    ];
    this.activeConfig = {
      eventId: `evt_web_${Date.now()}`,
      name: eventName,
      hostEndpoint: '127.0.0.1:8443',
      hostFingerprint: 'mock_fingerprint_web_preview',
      admissionToken: 'mock_token_web_preview',
      channels: presetChannels,
    };
    this.emit('onNetworkStatusUpdate', { connected: true, eventName });
    this.emit('onChannelListUpdate', { channels: presetChannels });
    return this.activeConfig;
  }

  async stopHost(): Promise<boolean> {
    this.activeConfig = null;
    this.emit('onNetworkStatusUpdate', { connected: false, reason: 'Host stopped' });
    return true;
  }

  async joinEvent(
    endpoint: string,
    token: string,
    hostFingerprint: string,
    displayName: string,
    channelId: string
  ): Promise<boolean> {
    this.currentChannel = channelId;
    this.emit('onNetworkStatusUpdate', { connected: true, eventName: 'Venue Pilot' });
    return true;
  }

  async leaveEvent(): Promise<boolean> {
    this.emit('onNetworkStatusUpdate', { connected: false, reason: 'Left event' });
    return true;
  }

  selectChannel(channelId: string): boolean {
    this.currentChannel = channelId;
    this.emit('onStateChange', { state: 'IDLE', channelId });
    return true;
  }

  requestFloor(): boolean {
    this.isTransmitting = true;
    setTimeout(() => {
      this.emit('onFloorChange', {
        floorState: 'TRANSMITTING',
        channelId: this.currentChannel,
        leaseId: `lease_web_${Date.now()}`,
      });
      this.emit('onSpeakerChange', {
        channelId: this.currentChannel,
        speakerId: 'web_me',
        speakerName: 'Me',
      });
    }, 100);
    return true;
  }

  releaseFloor(): boolean {
    this.isTransmitting = false;
    this.emit('onFloorChange', {
      floorState: 'IDLE',
      channelId: this.currentChannel,
    });
    this.emit('onSpeakerChange', {
      channelId: this.currentChannel,
      speakerId: null,
      speakerName: null,
    });
    return true;
  }

  setAudioRoute(route: string): boolean {
    return true;
  }

  playChirp(type: string): boolean {
    return true;
  }

  getDiagnostics(): DiagnosticsPayload {
    return {
      localIp: '127.0.0.1 (Web Preview)',
      hostEndpoint: this.activeConfig?.hostEndpoint || 'Offline',
      rttMs: 12,
      packetsSent: 150,
      packetsReceived: 148,
      packetLossRate: 0.0,
      jitterMs: 1.8,
      lastGrantLatencyMs: 110,
    };
  }

  getEventConfig(): EventConfigPayload | null {
    return this.activeConfig;
  }

  rotateAdmissionToken(): string {
    const newToken = `tok_rot_${Date.now()}`;
    if (this.activeConfig) {
      this.activeConfig.admissionToken = newToken;
    }
    return newToken;
  }

  revokeMember(clientId: string, reason: string): boolean {
    return true;
  }
}

export default registerWebModule(ExpoWalkieCoreModuleWeb, 'ExpoWalkieCoreModule');
