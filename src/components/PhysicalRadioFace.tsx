/**
 * PhysicalRadioFace Component
 * Matte-black handheld radio hardware interface.
 * Recessed OLED display, oversized rubber center PTT button, channel selectors.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Channel, FloorState, ConnectionState } from '../types';
import { WalkieLockup, SideKeyMark, BRAND_COLORS } from './WalkieBrand';

interface PhysicalRadioFaceProps {
  currentChannel: Channel;
  channels: Channel[];
  floorState: FloorState;
  activeSpeaker: string | null;
  connectionState: ConnectionState;
  role: 'organizer' | 'crew' | null;
  connectedCount: number;
  accessibilityMode: 'HOLD' | 'TAP_TOGGLE';
  onPttPress: () => void;
  onPttRelease: () => void;
  onPreviousChannel: () => void;
  onNextChannel: () => void;
  onOpenSettings: () => void;
  onOpenHostModal: () => void;
  onOpenJoinModal: () => void;
}

export const PhysicalRadioFace: React.FC<PhysicalRadioFaceProps> = ({
  currentChannel,
  channels,
  floorState,
  activeSpeaker,
  connectionState,
  role,
  connectedCount,
  accessibilityMode,
  onPttPress,
  onPttRelease,
  onPreviousChannel,
  onNextChannel,
  onOpenSettings,
  onOpenHostModal,
  onOpenJoinModal,
}) => {
  const pttScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [toggleActive, setToggleActive] = useState(false);
  const [cutoffCountdown, setCutoffCountdown] = useState(30);

  // Animate PTT depth on press
  const handlePressIn = () => {
    if (accessibilityMode === 'TAP_TOGGLE') {
      if (!toggleActive) {
        setToggleActive(true);
        setCutoffCountdown(30);
        onPttPress();
      } else {
        setToggleActive(false);
        onPttRelease();
      }
    } else {
      Animated.spring(pttScale, {
        toValue: 0.94,
        useNativeDriver: true,
        speed: 50,
      }).start();
      onPttPress();
    }
  };

  const handlePressOut = () => {
    if (accessibilityMode !== 'TAP_TOGGLE') {
      Animated.spring(pttScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
      }).start();
      onPttRelease();
    }
  };

  // Pulse animation when requesting or transmitting
  useEffect(() => {
    if (floorState === 'TRANSMITTING' || floorState === 'REQUESTING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
      setToggleActive(false);
    }
  }, [floorState]);

  // Countdown timer in toggle mode
  useEffect(() => {
    let timer: any = null;
    if (toggleActive && floorState === 'TRANSMITTING') {
      timer = setInterval(() => {
        setCutoffCountdown((prev) => {
          if (prev <= 1) {
            setToggleActive(false);
            onPttRelease();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [toggleActive, floorState]);

  // Current channel index for "CH 01 / 03" indicator
  const channelIndex = Math.max(0, channels.findIndex((c) => c.id === currentChannel.id));
  const channelNum = (channelIndex + 1).toString().padStart(2, '0');
  const totalChannels = channels.length.toString().padStart(2, '0');

  // PTT button visual styling based on state
  const isTransmitting = floorState === 'TRANSMITTING';
  const isRequesting = floorState === 'REQUESTING';
  const isBusy = floorState === 'BUSY';
  const isOffline = connectionState !== 'CONNECTED';

  let pttButtonColor = '#24272E';
  let pttBorderColor = '#3A3F4B';
  let pttGlowColor = 'transparent';
  let pttText = accessibilityMode === 'TAP_TOGGLE' ? 'TAP TO TALK' : 'HOLD TO TALK';

  if (isOffline) {
    pttButtonColor = '#1A1C22';
    pttBorderColor = '#2A2D35';
    pttText = 'HOST OFFLINE';
  } else if (isTransmitting) {
    pttButtonColor = '#991B1B';
    pttBorderColor = '#EF4444';
    pttGlowColor = 'rgba(239, 68, 68, 0.4)';
    pttText = accessibilityMode === 'TAP_TOGGLE' ? `LIVE (${cutoffCountdown}s) • STOP` : 'LIVE • TRANSMITTING';
  } else if (isRequesting) {
    pttButtonColor = '#1E3A8A';
    pttBorderColor = '#3B82F6';
    pttGlowColor = 'rgba(59, 130, 246, 0.4)';
    pttText = 'WAITING FOR FLOOR...';
  } else if (isBusy) {
    pttButtonColor = '#78350F';
    pttBorderColor = '#F59E0B';
    pttText = 'CHANNEL BUSY';
  }

  return (
    <View style={styles.chassis}>
      {/* Top Antenna and Dial Silhouettes */}
      <View style={styles.topHardwareRow}>
        <View style={styles.antennaStub} />
        <View style={styles.volumeKnob} />
        <View style={styles.channelKnob} />
      </View>

      {/* Radio Faceplate Container */}
      <View style={styles.faceplate}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.brandContainer}>
            <WalkieLockup height={22} variant="reverse" />
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {role === 'organizer' ? 'HOST' : role === 'crew' ? 'CREW' : 'STANDBY'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.dutyPill}>
              <View
                style={[
                  styles.dutyDot,
                  { backgroundColor: connectionState === 'CONNECTED' ? '#22C55E' : '#EF4444' },
                ]}
              />
              <Text style={styles.dutyText}>
                {connectionState === 'CONNECTED' ? 'DUTY ACTIVE' : 'OFFLINE'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onOpenSettings}
              style={styles.settingsButton}
              accessibilityLabel="Settings"
              accessibilityRole="button"
            >
              <Ionicons name="settings-sharp" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Speaker Grill Slats */}
        <View style={styles.speakerGrill}>
          <View style={styles.grillSlot} />
          <View style={styles.grillSlot} />
          <View style={styles.grillSlot} />
          <View style={styles.grillSlot} />
        </View>

        {/* Recessed Monochrome OLED Display */}
        <View style={styles.displayBevel}>
          <View style={styles.displayScreen}>
            {/* Top Display Metadata */}
            <View style={styles.displayMetaRow}>
              <Text style={styles.displayMetaText}>CH {channelNum}/{totalChannels}</Text>
              <Text style={styles.displayMetaText}>
                {connectedCount > 0 ? `${connectedCount} ONLINE` : 'LOCAL WI-FI'}
              </Text>
              <Text style={styles.displayMetaText}>462.562 MHz</Text>
            </View>

            {/* Giant Channel Selector Display */}
            <View style={styles.channelRow}>
              <TouchableOpacity
                onPress={onPreviousChannel}
                style={styles.channelArrowBtn}
                accessibilityLabel="Previous Channel"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={28} color="#4ADE80" />
              </TouchableOpacity>

              <View style={styles.channelCenter}>
                <Text
                  style={styles.channelName}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {currentChannel.name.toUpperCase()}
                </Text>
              </View>

              <TouchableOpacity
                onPress={onNextChannel}
                style={styles.channelArrowBtn}
                accessibilityLabel="Next Channel"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-forward" size={28} color="#4ADE80" />
              </TouchableOpacity>
            </View>

            {/* Floor and Speaker Status Banner */}
            <View style={styles.speakerStatusBanner}>
              {isOffline ? (
                <Text style={styles.statusOfflineText}>[ NO HOST CONNECTION ]</Text>
              ) : isTransmitting ? (
                <Text style={styles.statusTxText}>● TX: LIVE BROADCASTING</Text>
              ) : activeSpeaker ? (
                <Text style={styles.statusRxText}>◄◄ RX: {activeSpeaker.toUpperCase()} ►►</Text>
              ) : isBusy ? (
                <Text style={styles.statusBusyText}>▲ CHANNEL BUSY</Text>
              ) : (
                <Text style={styles.statusReadyText}>● READY (FLOOR OPEN)</Text>
              )}
            </View>
          </View>
        </View>

        {/* Center Oversized Rubber PTT Button */}
        <View style={styles.pttContainer}>
          <Animated.View
            style={[
              styles.pttGlowRing,
              {
                borderColor: pttBorderColor,
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ]}
          />

          <Animated.View style={{ transform: [{ scale: pttScale }] }}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={isOffline}
              style={[
                styles.pttButton,
                {
                  backgroundColor: pttButtonColor,
                  borderColor: pttBorderColor,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isTransmitting ? 'Transmitting audio. Release to listen.' : 'Push to Talk button'}
            >
              {/* Rubber Grip Ribs */}
              <View style={styles.pttRibs}>
                <View style={styles.pttRib} />
                <View style={styles.pttRib} />
                <View style={styles.pttRib} />
              </View>

              <Ionicons
                name={isTransmitting ? 'radio' : isBusy ? 'lock-closed' : 'mic'}
                size={34}
                color={isTransmitting ? '#FCA5A5' : isBusy ? '#FDE68A' : '#E5E7EB'}
              />

              <Text style={styles.pttButtonText}>{pttText}</Text>

              {accessibilityMode === 'TAP_TOGGLE' && (
                <Text style={styles.pttSubText}>
                  {toggleActive ? 'Tap to release mic' : 'Tap to lock transmission'}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        </View>

        {/* PTT Mode & Mic indicator */}
        <View style={styles.micHoleRow}>
          <View style={styles.micHole} />
          <Text style={styles.micLabel}>MIC</Text>
          <View style={styles.micHole} />
        </View>

        {/* Bottom Quick-Action Dock */}
        <View style={styles.actionDock}>
          <TouchableOpacity
            style={styles.dockButton}
            onPress={onOpenHostModal}
            accessibilityRole="button"
          >
            <Ionicons name="wifi" size={18} color="#D1D5DB" />
            <Text style={styles.dockButtonText}>
              {role === 'organizer' ? 'Host Admin' : 'Create Event'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockButton}
            onPress={onOpenJoinModal}
            accessibilityRole="button"
          >
            <Ionicons name="qr-code-outline" size={18} color="#D1D5DB" />
            <Text style={styles.dockButtonText}>
              {connectionState === 'CONNECTED' ? 'Scan / Switch' : 'Join Event'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');
const radioWidth = Math.min(width - 24, 400);

const styles = StyleSheet.create({
  chassis: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0B0D',
    flex: 1,
  },
  topHardwareRow: {
    flexDirection: 'row',
    width: radioWidth - 32,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 36,
  },
  antennaStub: {
    width: 24,
    height: 36,
    backgroundColor: '#1E2024',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 2,
    borderColor: '#2D3139',
    borderBottomWidth: 0,
  },
  volumeKnob: {
    width: 38,
    height: 18,
    backgroundColor: '#181A1E',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 2,
    borderColor: '#2D3139',
  },
  channelKnob: {
    width: 32,
    height: 14,
    backgroundColor: '#181A1E',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 2,
    borderColor: '#2D3139',
  },
  faceplate: {
    width: radioWidth,
    backgroundColor: '#14161A',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#282C35',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#E5E7EB',
  },
  roleBadge: {
    backgroundColor: '#282C35',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1C1F26',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E333E',
  },
  dutyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dutyText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D1D5DB',
    letterSpacing: 0.5,
  },
  settingsButton: {
    padding: 6,
    backgroundColor: '#1C1F26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2E333E',
  },
  speakerGrill: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  grillSlot: {
    width: '65%',
    height: 3,
    backgroundColor: '#0D0E12',
    borderRadius: 2,
  },
  displayBevel: {
    backgroundColor: '#0A0C0E',
    borderRadius: 14,
    padding: 4,
    borderWidth: 2,
    borderColor: '#242832',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 20,
  },
  displayScreen: {
    backgroundColor: '#070D09',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#112217',
  },
  displayMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#112A1B',
    paddingBottom: 4,
  },
  displayMetaText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 10,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  channelArrowBtn: {
    padding: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderRadius: 8,
  },
  channelCenter: {
    flex: 1,
    alignItems: 'center',
  },
  channelName: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 26,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 2,
    textAlign: 'center',
  },
  speakerStatusBanner: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#112A1B',
    alignItems: 'center',
  },
  statusReadyText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 1,
  },
  statusRxText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1,
  },
  statusTxText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 12,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 1,
  },
  statusBusyText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 1,
  },
  statusOfflineText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 1,
  },
  pttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    position: 'relative',
  },
  pttGlowRing: {
    position: 'absolute',
    width: 216,
    height: 216,
    borderRadius: 108,
    borderWidth: 2,
  },
  pttButton: {
    width: 196,
    height: 196,
    borderRadius: 98,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 8,
  },
  pttRibs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  pttRib: {
    width: 14,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
  },
  pttButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F3F4F6',
    letterSpacing: 1.5,
    marginTop: 8,
    textAlign: 'center',
  },
  pttSubText: {
    fontSize: 10,
    color: '#D1D5DB',
    marginTop: 2,
  },
  micHoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 10,
  },
  micHole: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0D0E12',
  },
  micLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 1.5,
  },
  actionDock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  dockButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E2128',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2F3440',
  },
  dockButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E5E7EB',
  },
});
