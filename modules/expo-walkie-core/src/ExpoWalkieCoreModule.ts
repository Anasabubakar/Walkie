import { NativeModule, requireNativeModule } from 'expo';
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
  ChannelLockedEvent,
  ConnectedMemberPayload,
} from './ExpoWalkieCore.types';

declare class ExpoWalkieCoreNativeModule extends NativeModule<{
  onStateChange: (event: StateChangeEvent) => void;
  onFloorChange: (event: FloorChangeEvent) => void;
  onSpeakerChange: (event: SpeakerChangeEvent) => void;
  onChannelListUpdate: (event: ChannelListUpdateEvent) => void;
  onNetworkStatusUpdate: (event: NetworkStatusUpdateEvent) => void;
  onMemberUpdate: (event: MemberUpdateEvent) => void;
  onChannelLocked: (event: ChannelLockedEvent) => void;
}> {
  startHost(eventName: string, channelsJson: string): Promise<EventConfigPayload>;
  stopHost(): Promise<boolean>;
  joinEvent(
    endpoint: string,
    token: string,
    hostFingerprint: string,
    displayName: string,
    channelId: string
  ): Promise<boolean>;
  leaveEvent(): Promise<boolean>;
  selectChannel(channelId: string): boolean;
  requestFloor(reqId?: string): boolean;
  releaseFloor(): boolean;
  setAudioRoute(route: string): boolean;
  playChirp(type: string): boolean;
  getDiagnostics(): DiagnosticsPayload;
  getEventConfig(): EventConfigPayload | null;
  rotateAdmissionToken(): string;
  revokeMember(clientId: string, reason: string): boolean;
  getClientId(): string;
  isChannelLocked(): boolean;
  lockMemberChannel(targetDeviceId: string, channelId: string | null, locked: boolean): boolean;
  getConnectedMembers(): ConnectedMemberPayload[];
}

export default requireNativeModule<ExpoWalkieCoreNativeModule>('ExpoWalkieCore');
