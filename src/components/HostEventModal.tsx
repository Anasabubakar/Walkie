/**
 * HostEventModal Component
 * Organizer event creation, QR invite presentation, channel admin,
 * token rotation, and device revocation.
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Channel, EventConfig } from '../types';
import { WalkieLockup, SideKeyMark, BRAND_COLORS } from './WalkieBrand';

interface HostEventModalProps {
  visible: boolean;
  onClose: () => void;
  isHosting: boolean;
  eventConfig: EventConfig | null;
  channels: Channel[];
  connectedCount: number;
  onStartHost: (eventName: string, channels: Channel[]) => Promise<void>;
  onStopHost: () => Promise<void>;
  onRotateToken: () => void;
  onRevokeMember: (clientId: string) => void;
}

export const HostEventModal: React.FC<HostEventModalProps> = ({
  visible,
  onClose,
  isHosting,
  eventConfig,
  channels,
  connectedCount,
  onStartHost,
  onStopHost,
  onRotateToken,
  onRevokeMember,
}) => {
  const [eventName, setEventName] = useState('Stage Crew Main');
  const [newChannelName, setNewChannelName] = useState('');
  const [starting, setStarting] = useState(false);

  // Invite payload encoded in the QR code
  const inviteQrData = eventConfig
    ? JSON.stringify({
        v: 1,
        eventId: eventConfig.eventId,
        name: eventConfig.name,
        endpoint: eventConfig.hostEndpoint,
        fp: eventConfig.hostFingerprint,
        token: eventConfig.admissionToken,
      })
    : '';

  const handleCreateEvent = async () => {
    if (!eventName.trim()) {
      Alert.alert('Required', 'Please enter an event name.');
      return;
    }
    setStarting(true);
    try {
      await onStartHost(eventName.trim(), channels);
    } catch (e: any) {
      Alert.alert('Host Error', e?.message || 'Could not start host server.');
    } finally {
      setStarting(false);
    }
  };

  const handleEndEventConfirm = () => {
    Alert.alert(
      'End Event?',
      'This will disconnect all crew members and close active channels.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Event',
          style: 'destructive',
          onPress: async () => {
            await onStopHost();
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
              <Text style={styles.modalTitle}>
                {isHosting ? 'Organizer Control Panel' : 'Create Venue Radio Event'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {isHosting
                  ? `Hosting: ${eventConfig?.name || 'Active'}`
                  : 'Host every channel locally on your phone'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            {!isHosting ? (
              // Event Setup Screen
              <View style={styles.setupSection}>
                <Text style={styles.inputLabel}>Event Name</Text>
                <TextInput
                  style={styles.input}
                  value={eventName}
                  onChangeText={setEventName}
                  placeholder="e.g. Festival Mainstage, Backstage Ops"
                  placeholderTextColor="#6B7280"
                />

                <Text style={styles.sectionHeader}>Initial Preset Channels</Text>
                <View style={styles.channelsList}>
                  {channels.map((ch, idx) => (
                    <View key={ch.id} style={styles.channelItem}>
                      <Text style={styles.channelNumber}>CH 0{idx + 1}</Text>
                      <Text style={styles.channelItemName}>{ch.name}</Text>
                      <View style={styles.presetBadge}>
                        <Text style={styles.presetBadgeText}>Preset</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.createBtn, starting && styles.disabledBtn]}
                  onPress={handleCreateEvent}
                  disabled={starting}
                >
                  <Ionicons name="radio" size={20} color="#0B0D0F" />
                  <Text style={styles.createBtnText}>
                    {starting ? 'Starting Local Host...' : 'Create Event & Start Host'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.setupNotice}>
                  Your phone will act as the local venue relay. Keep this phone charged and on the venue Wi-Fi.
                </Text>
              </View>
            ) : (
              // Active Host Screen
              <View style={styles.activeSection}>
                {/* QR Code Container */}
                <View style={styles.qrContainer}>
                  <Text style={styles.qrHeader}>Crew Invite QR Code</Text>
                  <Text style={styles.qrSubheader}>
                    Have crew scan this with Walkie on the same Wi-Fi
                  </Text>
                  <View style={styles.qrCard}>
                    {inviteQrData ? (
                      <QRCode
                        value={inviteQrData}
                        size={180}
                        color="#0B0D0F"
                        backgroundColor="#FFFFFF"
                      />
                    ) : null}
                  </View>
                </View>

                {/* Host Network Details */}
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Local Endpoint</Text>
                    <Text style={styles.detailValue}>
                      {eventConfig?.hostEndpoint || '127.0.0.1:8443'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Connected Crew</Text>
                    <Text style={[styles.detailValue, { color: '#4ADE80' }]}>
                      {connectedCount} Device{connectedCount === 1 ? '' : 's'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Host Fingerprint</Text>
                    <Text style={styles.fingerprintText} numberOfLines={1}>
                      {eventConfig?.hostFingerprint || 'e3b0c442...'}
                    </Text>
                  </View>
                </View>

                {/* Action Controls */}
                <View style={styles.hostActionsRow}>
                  <TouchableOpacity
                    style={styles.actionPill}
                    onPress={() => {
                      onRotateToken();
                      Alert.alert('Rotated', 'New admission token issued. Old invite links are expired.');
                    }}
                  >
                    <Ionicons name="refresh" size={16} color="#60A5FA" />
                    <Text style={styles.actionPillText}>Rotate Token</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionPill, styles.dangerPill]}
                    onPress={handleEndEventConfirm}
                  >
                    <Ionicons name="stop-circle-outline" size={16} color="#EF4444" />
                    <Text style={[styles.actionPillText, { color: '#EF4444' }]}>
                      End Event
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
  setupSection: {
    paddingBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1D5DB',
    marginBottom: 6,
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
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  channelsList: {
    gap: 8,
    marginBottom: 20,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E222A',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2E3A',
  },
  channelNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4ADE80',
    width: 60,
  },
  channelItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  presetBadge: {
    backgroundColor: '#282C36',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presetBadgeText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: '#4ADE80',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#0B0D0F',
    fontWeight: '800',
    fontSize: 15,
  },
  setupNotice: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  activeSection: {
    paddingBottom: 20,
    alignItems: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  qrHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F3F4F6',
  },
  qrSubheader: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
    marginTop: 2,
  },
  qrCard: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  detailCard: {
    width: '100%',
    backgroundColor: '#1E222A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2F3442',
    marginTop: 16,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  fingerprintText: {
    fontSize: 11,
    color: '#60A5FA',
    maxWidth: 180,
  },
  hostActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 16,
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E222A',
    borderWidth: 1,
    borderColor: '#2E3544',
    paddingVertical: 12,
    borderRadius: 10,
  },
  dangerPill: {
    borderColor: '#7F1D1D',
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
  },
});
