/**
 * JoinModal Component
 * Camera QR Scanner and Manual Pairing fallback for crew members.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WalkieLockup, SideKeyMark, BRAND_COLORS } from './WalkieBrand';

interface JoinModalProps {
  visible: boolean;
  onClose: () => void;
  onJoin: (
    endpoint: string,
    token: string,
    fingerprint: string,
    displayName: string,
    channelId: string
  ) => Promise<void>;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  visible,
  onClose,
  onJoin,
}) => {
  const [tab, setTab] = useState<'scan' | 'manual'>('scan');
  const [permission, requestPermission] = useCameraPermissions();

  const [endpoint, setEndpoint] = useState('192.168.1.100:8443');
  const [fingerprint, setFingerprint] = useState('');
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('Crew Lead');
  const [channelId, setChannelId] = useState('ch_stage');
  const [joining, setJoining] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.endpoint && parsed.token) {
        setJoining(true);
        await onJoin(
          parsed.endpoint,
          parsed.token,
          parsed.fp || '',
          displayName,
          channelId
        );
        setJoining(false);
        onClose();
      } else {
        Alert.alert('Invalid QR', 'This QR code is not a valid Walkie event invite.');
      }
    } catch (e: any) {
      Alert.alert('Scan Failed', e?.message || 'Could not parse invite QR code.');
    } finally {
      setJoining(false);
    }
  };

  const handleManualJoin = async () => {
    if (!endpoint.trim() || !displayName.trim()) {
      Alert.alert('Required Fields', 'Please enter host endpoint and your display name.');
      return;
    }
    setJoining(true);
    try {
      await onJoin(
        endpoint.trim(),
        token.trim(),
        fingerprint.trim(),
        displayName.trim(),
        channelId
      );
      onClose();
    } catch (e: any) {
      Alert.alert('Join Failed', e?.message || 'Could not connect to venue host.');
    } finally {
      setJoining(false);
    }
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
              <Text style={styles.modalTitle}>Join Venue Radio</Text>
              <Text style={styles.modalSubtitle}>Connect over local venue Wi-Fi</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'scan' && styles.activeTab]}
              onPress={() => setTab('scan')}
            >
              <Ionicons
                name="qr-code"
                size={16}
                color={tab === 'scan' ? '#4ADE80' : '#9CA3AF'}
              />
              <Text style={[styles.tabText, tab === 'scan' && styles.activeTabText]}>
                Scan QR
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, tab === 'manual' && styles.activeTab]}
              onPress={() => setTab('manual')}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={tab === 'manual' ? '#4ADE80' : '#9CA3AF'}
              />
              <Text style={[styles.tabText, tab === 'manual' && styles.activeTabText]}>
                Manual Entry
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'scan' ? (
            <View style={styles.scanContainer}>
              {!permission?.granted ? (
                <View style={styles.permissionBox}>
                  <Ionicons name="camera-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.permissionText}>
                    Camera permission is required to scan the organizer's QR code.
                  </Text>
                  <TouchableOpacity
                    style={styles.grantBtn}
                    onPress={requestPermission}
                  >
                    <Text style={styles.grantBtnText}>Grant Camera Access</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.fallbackManualBtn}
                    onPress={() => setTab('manual')}
                  >
                    <Text style={styles.fallbackManualText}>Or enter host details manually</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cameraFrame}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={joining ? undefined : handleBarCodeScanned}
                  />
                  <View style={styles.viewfinderBox} />
                  {joining && (
                    <View style={styles.joiningOverlay}>
                      <ActivityIndicator size="large" color="#4ADE80" />
                      <Text style={styles.joiningText}>Connecting to venue host...</Text>
                    </View>
                  )}
                  <Text style={styles.scanHint}>
                    Align organizer's QR code inside the frame
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <ScrollView style={styles.manualForm}>
              <Text style={styles.inputLabel}>Your Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Stage Lead, FOH Sound"
                placeholderTextColor="#6B7280"
              />

              <Text style={styles.inputLabel}>Host Endpoint (IP:Port)</Text>
              <TextInput
                style={styles.input}
                value={endpoint}
                onChangeText={setEndpoint}
                placeholder="192.168.1.100:8443"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Host Identity Fingerprint (Optional)</Text>
              <TextInput
                style={styles.input}
                value={fingerprint}
                onChangeText={setFingerprint}
                placeholder="SHA-256 host fingerprint"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Admission Token</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="Paste token or leave empty if open"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Initial Channel</Text>
              <View style={styles.channelRow}>
                {[
                  { id: 'ch_stage', name: 'Stage' },
                  { id: 'ch_prod', name: 'Production' },
                  { id: 'ch_front', name: 'Front Desk' },
                ].map((ch) => (
                  <TouchableOpacity
                    key={ch.id}
                    style={[
                      styles.channelChip,
                      channelId === ch.id && styles.activeChannelChip,
                    ]}
                    onPress={() => setChannelId(ch.id)}
                  >
                    <Text
                      style={[
                        styles.channelChipText,
                        channelId === ch.id && styles.activeChannelChipText,
                      ]}
                    >
                      {ch.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.joinBtn, joining && styles.disabledBtn]}
                onPress={handleManualJoin}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#0B0D0F" />
                ) : (
                  <Text style={styles.joinBtnText}>Connect to Host</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
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
    maxHeight: '90%',
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1F232B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#2A303C',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  activeTabText: {
    color: '#4ADE80',
  },
  scanContainer: {
    height: 340,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFrame: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderBox: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#4ADE80',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scanHint: {
    position: 'absolute',
    bottom: 20,
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  joiningOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  joiningText: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionBox: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  permissionText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  grantBtn: {
    backgroundColor: '#4ADE80',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  grantBtnText: {
    color: '#0B0D0F',
    fontWeight: '800',
    fontSize: 14,
  },
  fallbackManualBtn: {
    padding: 8,
  },
  fallbackManualText: {
    color: '#60A5FA',
    fontSize: 13,
  },
  manualForm: {
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1D5DB',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#1E222A',
    borderWidth: 1,
    borderColor: '#303644',
    borderRadius: 10,
    color: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  channelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#303644',
    backgroundColor: '#1E222A',
    alignItems: 'center',
  },
  activeChannelChip: {
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  channelChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  activeChannelChipText: {
    color: '#4ADE80',
  },
  joinBtn: {
    backgroundColor: '#4ADE80',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  joinBtnText: {
    color: '#0B0D0F',
    fontWeight: '800',
    fontSize: 15,
  },
});
