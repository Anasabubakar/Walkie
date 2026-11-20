/**
 * Walkie - Main Application Entrypoint
 * React Native + Expo matte-black handheld radio.
 * Offline local Wi-Fi push-to-talk system.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import WalkieService from './src/services/WalkieService';
import { PhysicalRadioFace } from './src/components/PhysicalRadioFace';
import { JoinModal } from './src/components/JoinModal';
import { HostEventModal } from './src/components/HostEventModal';
import { SettingsModal } from './src/components/SettingsModal';
import { Channel } from './src/types';

export default function App() {
  const service = WalkieService.getInstance();

  // State synchronized with WalkieService
  const [role, setRole] = useState(service.role);
  const [connectionState, setConnectionState] = useState(service.connectionState);
  const [floorState, setFloorState] = useState(service.floorState);
  const [currentChannel, setCurrentChannel] = useState(service.currentChannel);
  const [channels, setChannels] = useState(service.channels);
  const [activeSpeaker, setActiveSpeaker] = useState(service.activeSpeaker);
  const [connectedCount, setConnectedCount] = useState(service.connectedMemberCount);
  const [audioSettings, setAudioSettings] = useState(service.audioSettings);
  const [diagnostics, setDiagnostics] = useState(service.diagnostics);
  const [eventConfig, setEventConfig] = useState(service.eventConfig);

  // Modal display states
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [isHostModalVisible, setIsHostModalVisible] = useState(false);
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  useEffect(() => {
    // Request essential runtime permissions on Android launch
    if (Platform.OS === 'android') {
      const requestPermissions = async () => {
        try {
          const perms: any[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
            perms.push('android.permission.POST_NOTIFICATIONS' as any);
          }
          await PermissionsAndroid.requestMultiple(perms);
        } catch (e) {
          console.warn('[Walkie] Permission request error:', e);
        }
      };
      requestPermissions();
    }
  }, []);

  useEffect(() => {
    // Subscribe to state updates from WalkieService
    const unsubscribe = service.subscribe(() => {
      setRole(service.role);
      setConnectionState(service.connectionState);
      setFloorState(service.floorState);
      setCurrentChannel(service.currentChannel);
      setChannels(service.channels);
      setActiveSpeaker(service.activeSpeaker);
      setConnectedCount(service.connectedMemberCount);
      setAudioSettings({ ...service.audioSettings });
      setDiagnostics({ ...service.diagnostics });
      setEventConfig(service.eventConfig);
    });

    return unsubscribe;
  }, []);

  // --- Handlers ---

  const handlePttPress = () => {
    service.pttPress();
  };

  const handlePttRelease = () => {
    service.pttRelease();
  };

  const handlePreviousChannel = () => {
    service.switchChannel('prev');
  };

  const handleNextChannel = () => {
    service.switchChannel('next');
  };

  const handleStartHost = async (eventName: string, initialChannels: Channel[]) => {
    try {
      if (Platform.OS === 'android') {
        const hasMic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!hasMic) {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert(
              'Microphone Permission Required',
              'Walkie requires microphone access to transmit audio on radio channels.'
            );
            return;
          }
        }
      }
      await service.startHost(eventName, initialChannels);
      Alert.alert(
        'Host Started',
        `Event "${eventName}" is running. Share your invite QR code with crew members on this Wi-Fi.`
      );
    } catch (e: any) {
      Alert.alert('Host Error', e?.message || 'Could not start event host.');
    }
  };

  const handleStopHost = async () => {
    try {
      await service.stopHost();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to stop event.');
    }
  };

  const handleJoinEvent = async (
    endpoint: string,
    token: string,
    fingerprint: string,
    displayName: string,
    channelId: string
  ) => {
    try {
      if (Platform.OS === 'android') {
        const hasMic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!hasMic) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        }
      }
      await service.joinEvent(endpoint, token, fingerprint, displayName, channelId);
      Alert.alert('Connected', `Connected to venue host on channel ${channelId}.`);
    } catch (e: any) {
      throw e;
    }
  };

  const handleLeaveEvent = async () => {
    await service.leaveEvent();
  };

  const handleSetAudioRoute = (route: 'SPEAKER' | 'EARPIECE' | 'BLUETOOTH') => {
    service.setAudioRoute(route);
  };

  const handleToggleChirps = () => {
    service.toggleChirps();
  };

  const handleToggleHaptics = () => {
    service.toggleHaptics();
  };

  const handleSetAccessibilityMode = (mode: 'HOLD' | 'TAP_TOGGLE') => {
    service.setAccessibilityMode(mode);
  };

  const handleRefreshDiagnostics = () => {
    service.refreshDiagnostics();
  };

  const handleRotateToken = () => {
    service.rotateInviteToken();
  };

  const handleRevokeMember = (clientId: string) => {
    service.revokeMember(clientId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />

      {/* Handheld Physical Radio Face */}
      <PhysicalRadioFace
        currentChannel={currentChannel}
        channels={channels}
        floorState={floorState}
        activeSpeaker={activeSpeaker}
        connectionState={connectionState}
        role={role}
        connectedCount={connectedCount}
        accessibilityMode={audioSettings.accessibilityPttMode}
        onPttPress={handlePttPress}
        onPttRelease={handlePttRelease}
        onPreviousChannel={handlePreviousChannel}
        onNextChannel={handleNextChannel}
        onOpenSettings={() => setIsSettingsModalVisible(true)}
        onOpenHostModal={() => setIsHostModalVisible(true)}
        onOpenJoinModal={() => setIsJoinModalVisible(true)}
      />

      {/* Join Event Modal (QR Scanner & Manual Entry) */}
      <JoinModal
        visible={isJoinModalVisible}
        onClose={() => setIsJoinModalVisible(false)}
        onJoin={handleJoinEvent}
      />

      {/* Host Event Modal (Organizer Controls & Invite QR) */}
      <HostEventModal
        visible={isHostModalVisible}
        onClose={() => setIsHostModalVisible(false)}
        isHosting={role === 'organizer' && connectionState === 'CONNECTED'}
        eventConfig={eventConfig}
        channels={channels}
        connectedCount={connectedCount}
        onStartHost={handleStartHost}
        onStopHost={handleStopHost}
        onRotateToken={handleRotateToken}
        onRevokeMember={handleRevokeMember}
      />

      {/* Settings & Hardware Diagnostics Modal */}
      <SettingsModal
        visible={isSettingsModalVisible}
        onClose={() => setIsSettingsModalVisible(false)}
        settings={audioSettings}
        diagnostics={diagnostics}
        onSetAudioRoute={handleSetAudioRoute}
        onToggleChirps={handleToggleChirps}
        onToggleHaptics={handleToggleHaptics}
        onSetAccessibilityMode={handleSetAccessibilityMode}
        onRefreshDiagnostics={handleRefreshDiagnostics}
        onLeaveEvent={handleLeaveEvent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0D',
  },
});
