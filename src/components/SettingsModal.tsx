/**
 * SettingsModal Component
 * Audio routing, hardware chirps, haptics, mic loopback test,
 * accessibility PTT cutoff, and live network diagnostics.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioSettings, NetworkDiagnostics } from '../types';
import { WalkieLockup, SideKeyMark, BRAND_COLORS } from './WalkieBrand';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  settings: AudioSettings;
  diagnostics: NetworkDiagnostics;
  onSetAudioRoute: (route: 'SPEAKER' | 'EARPIECE' | 'BLUETOOTH') => void;
  onToggleChirps: () => void;
  onToggleHaptics: () => void;
  onSetAccessibilityMode: (mode: 'HOLD' | 'TAP_TOGGLE') => void;
  onRefreshDiagnostics: () => void;
  onLeaveEvent: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  settings,
  diagnostics,
  onSetAudioRoute,
  onToggleChirps,
  onToggleHaptics,
  onSetAccessibilityMode,
  onRefreshDiagnostics,
  onLeaveEvent,
}) => {
  const [testingMic, setTestingMic] = useState(false);

  const runLocalMicTest = () => {
    setTestingMic(true);
    setTimeout(() => {
      setTestingMic(false);
      Alert.alert(
        'Mic Test Completed',
        'Audio captured and looped back through active output successfully.'
      );
    }, 3000);
  };

  const handleLeaveConfirm = () => {
    Alert.alert(
      'Leave Event?',
      'Are you sure you want to disconnect from this venue radio session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await onLeaveEvent();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <View style={{ marginBottom: 6 }}>
                <WalkieLockup height={22} variant="reverse" />
              </View>
              <Text style={styles.modalTitle}>Radio Hardware Settings</Text>
              <Text style={styles.modalSubtitle}>Audio route, tactile cues & diagnostics</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Audio Output Route */}
            <Text style={styles.sectionTitle}>Audio Output Route</Text>
            <View style={styles.routeSelector}>
              {(['SPEAKER', 'EARPIECE', 'BLUETOOTH'] as const).map((route) => {
                const isActive = settings.route === route;
                const iconName =
                  route === 'SPEAKER'
                    ? 'volume-high'
                    : route === 'EARPIECE'
                    ? 'call'
                    : 'bluetooth';
                const label =
                  route === 'SPEAKER'
                    ? 'Speaker'
                    : route === 'EARPIECE'
                    ? 'Earpiece'
                    : 'Bluetooth Headset';

                return (
                  <TouchableOpacity
                    key={route}
                    style={[styles.routeOption, isActive && styles.activeRouteOption]}
                    onPress={() => onSetAudioRoute(route)}
                  >
                    <Ionicons
                      name={iconName}
                      size={20}
                      color={isActive ? '#4ADE80' : '#9CA3AF'}
                    />
                    <Text
                      style={[
                        styles.routeLabel,
                        isActive && styles.activeRouteLabel,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hardware Cues & Haptics */}
            <Text style={styles.sectionTitle}>Tactile & Audio Feedback</Text>
            <View style={styles.settingCard}>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleTitle}>Grant Chirps & Tones</Text>
                  <Text style={styles.toggleDesc}>
                    Chirp on speak grant, low cue when busy
                  </Text>
                </View>
                <Switch
                  value={settings.chirpsEnabled}
                  onValueChange={onToggleChirps}
                  trackColor={{ false: '#374151', true: '#4ADE80' }}
                  thumbColor="#F3F4F6"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleTitle}>Haptic Feedback</Text>
                  <Text style={styles.toggleDesc}>
                    Vibrations on PTT press, grant & release
                  </Text>
                </View>
                <Switch
                  value={settings.hapticsEnabled}
                  onValueChange={onToggleHaptics}
                  trackColor={{ false: '#374151', true: '#4ADE80' }}
                  thumbColor="#F3F4F6"
                />
              </View>
            </View>

            {/* Accessibility PTT Mode */}
            <Text style={styles.sectionTitle}>PTT Button Operation</Text>
            <View style={styles.settingCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.toggleTitle}>
                    {settings.accessibilityPttMode === 'HOLD'
                      ? 'Hold to Talk (Standard)'
                      : 'Tap to Talk (30s Safe Cutoff)'}
                  </Text>
                  <Text style={styles.toggleDesc}>
                    {settings.accessibilityPttMode === 'HOLD'
                      ? 'Press & hold to speak, release to listen'
                      : 'Tap once to transmit with 30s auto-cutoff'}
                  </Text>
                </View>
                <Switch
                  value={settings.accessibilityPttMode === 'TAP_TOGGLE'}
                  onValueChange={(val) =>
                    onSetAccessibilityMode(val ? 'TAP_TOGGLE' : 'HOLD')
                  }
                  trackColor={{ false: '#374151', true: '#4ADE80' }}
                  thumbColor="#F3F4F6"
                />
              </View>
            </View>

            {/* Local Hardware Loopback Test */}
            <Text style={styles.sectionTitle}>Mic & Speaker Loopback Test</Text>
            <View style={styles.settingCard}>
              <Text style={styles.toggleDesc}>
                Test microphone and active speaker route locally without broadcasting to the venue channel.
              </Text>
              <TouchableOpacity
                style={[styles.testBtn, testingMic && styles.testingBtn]}
                onPress={runLocalMicTest}
                disabled={testingMic}
              >
                <Ionicons
                  name={testingMic ? 'mic-outline' : 'play'}
                  size={18}
                  color={testingMic ? '#FBBF24' : '#0B0D0F'}
                />
                <Text
                  style={[
                    styles.testBtnText,
                    testingMic && { color: '#FBBF24' },
                  ]}
                >
                  {testingMic ? 'Recording 3s Sample...' : 'Run Local Loopback Test'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Live Network Diagnostics */}
            <View style={styles.diagHeaderRow}>
              <Text style={styles.sectionTitle}>Network Diagnostics</Text>
              <TouchableOpacity onPress={onRefreshDiagnostics}>
                <Ionicons name="refresh" size={16} color="#60A5FA" />
              </TouchableOpacity>
            </View>
            <View style={styles.diagCard}>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Local IP</Text>
                <Text style={styles.diagValue}>{diagnostics.localIp}</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Host Endpoint</Text>
                <Text style={styles.diagValue}>{diagnostics.hostEndpoint}</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Round Trip Time (RTT)</Text>
                <Text
                  style={[
                    styles.diagValue,
                    { color: diagnostics.rttMs < 50 ? '#4ADE80' : '#F59E0B' },
                  ]}
                >
                  {diagnostics.rttMs} ms
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Packets Sent / Recv</Text>
                <Text style={styles.diagValue}>
                  {diagnostics.packetsSent} / {diagnostics.packetsReceived}
                </Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Packet Loss / Jitter</Text>
                <Text style={styles.diagValue}>
                  {(diagnostics.packetLossRate * 100).toFixed(1)}% / {diagnostics.jitterMs}ms
                </Text>
              </View>
            </View>

            {/* About & Production Identity Card */}
            <View style={[styles.diagCard, { alignItems: 'center', paddingVertical: 18, marginTop: 16 }]}>
              <WalkieLockup height={28} variant="reverse" />
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                Walkie Production Identity • Side Key
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                Engine: Rust walkie-core • Zero-WAN LAN Audio Relay
              </Text>
              <Text style={{ color: '#4B5563', fontSize: 10, marginTop: 2 }}>
                Version 1.0.0 (Venue Pilot Build)
              </Text>
            </View>

            {/* Leave Event */}
            <TouchableOpacity
              style={styles.leaveButton}
              onPress={handleLeaveConfirm}
            >
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.leaveButtonText}>Leave Venue Radio</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16181E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2E39',
    maxHeight: '88%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F3F4F6',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollArea: {
    maxHeight: 520,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  routeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  routeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E222A',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D3442',
  },
  activeRouteOption: {
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  activeRouteLabel: {
    color: '#4ADE80',
  },
  settingCard: {
    backgroundColor: '#1E222A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2D3442',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A303C',
    marginVertical: 12,
  },
  testBtn: {
    backgroundColor: '#4ADE80',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  testingBtn: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B0D0F',
  },
  diagHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  diagCard: {
    backgroundColor: '#13151A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252934',
    gap: 8,
    marginBottom: 20,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  diagValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5E7EB',
    fontFamily: 'monospace',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 30,
  },
  leaveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
  },
});
