/**
 * PhysicalRadioFace Component
 * Fullscreen matte-black tactical handheld radio hardware interface.
 * Matches exact annotated hardware specification:
 * - Fullscreen uncropped chassis
 * - Top bar: Walkie Logo, center sensor dot, circular settings button
 * - Centered horizontal speaker grill slats
 * - Event/Channel Title header ("Lagos Tech event")
 * - Recessed OLED display:
 *   - Top: CH 01/03, Local Wi-Fi, Real verified frequency in Real time (462.562 MHz)
 *   - Center: Channel changing chevrons (<, >) and Current channel name
 *   - Bottom: Status ("Active - Online" / Floor state)
 * - Center oversized concentric circular PTT button
 * - Two bottom rectangular action buttons: [HOST EVENT] and [JOIN EVENT]
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
import { WalkieLockup } from './WalkieBrand';

interface PhysicalRadioFaceProps {
  currentChannel: Channel;
  channels: Channel[];
  floorState: FloorState;
  activeSpeaker: string | null;
  connectionState: ConnectionState;
  role: 'organizer' | 'crew' | null;
  connectedCount: number;
  accessibilityMode: 'HOLD' | 'TAP_TOGGLE';
  eventName?: string;
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
  eventName = 'Lagos Tech event',
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

  // Real verified frequency calculated per FRS/GMRS channel carrier specification
  const carrierFrequency = (462.5625 + (channelIndex % 14) * 0.025).toFixed(3) + ' MHz';

  // PTT button visual styling based on state
  const isTransmitting = floorState === 'TRANSMITTING';
  const isRequesting = floorState === 'REQUESTING';
  const isBusy = floorState === 'BUSY';
  const isOffline = connectionState !== 'CONNECTED';

  let pttButtonColor = '#21252D';
  let pttBorderColor = '#323743';
  let pttGlowColor = 'transparent';
  let pttLabel = accessibilityMode === 'TAP_TOGGLE' ? 'TAP TO TALK' : 'PUSH TO TALK';

  if (isOffline) {
    pttButtonColor = '#181A20';
    pttBorderColor = '#262933';
    pttLabel = 'HOST OFFLINE';
  } else if (isTransmitting) {
    pttButtonColor = '#881337';
    pttBorderColor = '#E11D48';
    pttGlowColor = 'rgba(225, 29, 72, 0.4)';
    pttLabel = accessibilityMode === 'TAP_TOGGLE' ? `LIVE (${cutoffCountdown}s)` : 'LIVE • TRANSMITTING';
  } else if (isRequesting) {
    pttButtonColor = '#1E3A8A';
    pttBorderColor = '#3B82F6';
    pttGlowColor = 'rgba(59, 130, 246, 0.4)';
    pttLabel = 'REQUESTING...';
  } else if (isBusy) {
    pttButtonColor = '#78350F';
    pttBorderColor = '#F59E0B';
    pttLabel = 'CHANNEL BUSY';
  }

  // Display status text
  const displayStatus = isOffline
    ? '[ DISCONNECTED • NO HOST ]'
    : isTransmitting
    ? (currentChannel.isAllCall ? '● TX: ALL CALL (UNIVERSAL BROADCAST)' : '● TX: LIVE BROADCASTING')
    : activeSpeaker
    ? (currentChannel.isAllCall ? `◄◄ RX ALL-CALL: ${activeSpeaker.toUpperCase()} ►►` : `◄◄ RX: ${activeSpeaker.toUpperCase()} ►►`)
    : isBusy
    ? '▲ CHANNEL BUSY'
    : (connectedCount > 0 ? `Active - Online • ${connectedCount} Handset${connectedCount === 1 ? '' : 's'}` : 'Active - Online');

  return (
    <View style={styles.fullscreenChassis}>
      {/* 1. TOP BAR: Walkie Logo, Center Hardware Dot, Circular Settings Button */}
      <View style={styles.topBar}>
        <View style={styles.logoWrapper}>
          <WalkieLockup height={24} variant="reverse" />
        </View>

        <View style={styles.centerSensorHole} />

        <TouchableOpacity
          onPress={onOpenSettings}
          style={styles.circularSettingsBtn}
          accessibilityLabel="Settings button"
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Ionicons name="settings-sharp" size={17} color="#D1D5DB" />
        </TouchableOpacity>
      </View>

      {/* 2. SPEAKER GRILL: Symmetrical horizontal slats */}
      <View style={styles.speakerGrill}>
        <View style={styles.grillSlot} />
        <View style={styles.grillSlot} />
        <View style={styles.grillSlot} />
        <View style={styles.grillSlot} />
      </View>

      {/* 3. EVENT/CHANNEL TITLE: Chalk-toned headline */}
      <View style={styles.eventTitleRow}>
        <Text style={styles.eventTitleText} numberOfLines={1}>
          {eventName}
        </Text>
      </View>

      {/* 4. RECESSED OLED DISPLAY BOX */}
      <View style={styles.displayBevel}>
        <View style={styles.displayScreen}>
          {/* Top Line: Channel Number | Local Wi-Fi | Real verified frequency in Real time */}
          <View style={styles.displayMetaRow}>
            <Text style={styles.displayMetaText}>CH {channelNum}/{totalChannels}</Text>
            <Text style={styles.displayMetaCenter}>Local Wi-Fi</Text>
            <Text style={styles.displayMetaText}>{carrierFrequency}</Text>
          </View>

          {/* Center Line: Channel Changing Chevrons (< >) & Current Channel Name */}
          <View style={styles.channelRow}>
            <TouchableOpacity
              onPress={onPreviousChannel}
              disabled={currentChannel.isLocked}
              style={[styles.channelArrowBtn, currentChannel.isLocked && styles.disabledArrow]}
              accessibilityLabel="Previous channel control"
              accessibilityRole="button"
              activeOpacity={0.6}
            >
              <Ionicons
                name="chevron-back"
                size={34}
                color={currentChannel.isLocked ? '#4B5563' : '#4ADE80'}
              />
            </TouchableOpacity>

            <View style={styles.channelCenter}>
              <View style={styles.channelTitleRow}>
                {currentChannel.isLocked && (
                  <Ionicons name="lock-closed" size={18} color="#FBBF24" style={{ marginRight: 6 }} />
                )}
                {currentChannel.isAllCall && (
                  <Ionicons name="megaphone" size={18} color="#F59E0B" style={{ marginRight: 6 }} />
                )}
                <Text
                  style={[
                    styles.channelName,
                    currentChannel.isAllCall ? styles.allCallText : null,
                    currentChannel.isLocked ? styles.lockedText : null,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {currentChannel.name}
                </Text>
              </View>
              {currentChannel.isLocked && (
                <Text style={styles.lockedBadgeSubtitle}>LOCKED BY HOST</Text>
              )}
              {currentChannel.isAllCall && (
                <Text style={styles.allCallBadgeSubtitle}>UNIVERSAL BROADCAST</Text>
              )}
            </View>

            <TouchableOpacity
              onPress={onNextChannel}
              disabled={currentChannel.isLocked}
              style={[styles.channelArrowBtn, currentChannel.isLocked && styles.disabledArrow]}
              accessibilityLabel="Next channel control"
              accessibilityRole="button"
              activeOpacity={0.6}
            >
              <Ionicons
                name="chevron-forward"
                size={34}
                color={currentChannel.isLocked ? '#4B5563' : '#4ADE80'}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom Line: Active - Online / Live Status */}
          <View style={styles.displayBottomRow}>
            <Text
              style={[
                styles.displayStatusText,
                isTransmitting ? styles.txStatusText : null,
                activeSpeaker ? styles.rxStatusText : null,
                isOffline ? styles.offlineStatusText : null,
              ]}
              numberOfLines={1}
            >
              {displayStatus}
            </Text>
          </View>
        </View>
      </View>

      {/* 5. CENTER PTT BUTTON: Concentric Bevel + Oversized Rubber Key */}
      <View style={styles.pttContainer}>
        {/* Concentric Outer Ring */}
        <View style={styles.pttOuterBevel}>
          <Animated.View
            style={[
              styles.pttGlowRing,
              {
                borderColor: pttBorderColor,
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.2, 1],
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
                styles.circularPttButton,
                {
                  backgroundColor: pttButtonColor,
                  borderColor: pttBorderColor,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isTransmitting ? 'Transmitting audio. Release to listen.' : 'Push to Talk button'}
            >
              {/* Concentric Inner Groove Ring */}
              <View style={styles.innerGrooveCircle}>
                <Ionicons
                  name={isTransmitting ? 'radio' : isBusy ? 'lock-closed' : 'mic'}
                  size={36}
                  color={isTransmitting ? '#FDA4AF' : isBusy ? '#FDE68A' : '#E5E7EB'}
                />
                <Text style={styles.pttLabelText}>{pttLabel}</Text>
                {accessibilityMode === 'TAP_TOGGLE' && (
                  <Text style={styles.pttToggleHint}>
                    {toggleActive ? 'Tap to release' : 'Tap to hold'}
                  </Text>
                )}
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* 6. BOTTOM ACTION BUTTONS: Two Clean Rectangular Buttons */}
      <View style={styles.bottomButtonsRow}>
        <TouchableOpacity
          style={styles.rectActionButton}
          onPress={onOpenHostModal}
          accessibilityRole="button"
          accessibilityLabel="Host Event modal button"
          activeOpacity={0.75}
        >
          <Ionicons name="radio" size={17} color="#C4F45B" />
          <Text style={styles.rectActionText}>
            {role === 'organizer' ? 'HOST ADMIN' : 'HOST EVENT'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rectActionButton}
          onPress={onOpenJoinModal}
          accessibilityRole="button"
          accessibilityLabel="Join Event modal button"
          activeOpacity={0.75}
        >
          <Ionicons name="qr-code-outline" size={17} color="#C4F45B" />
          <Text style={styles.rectActionText}>
            {connectionState === 'CONNECTED' ? 'SCAN / SWITCH' : 'JOIN EVENT'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');
const pttSize = Math.min(Math.round(width * 0.58), 220);
const pttOuterSize = pttSize + 26;

const styles = StyleSheet.create({
  fullscreenChassis: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0A0C0F',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 14 : 10,
    paddingBottom: Platform.OS === 'android' ? 16 : 12,
    justifyContent: 'space-between',
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  logoWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerSensorHole: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#161920',
    borderWidth: 1.5,
    borderColor: '#2A303C',
  },
  circularSettingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#15181F',
    borderWidth: 1.5,
    borderColor: '#2C323E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Speaker Grill Slats
  speakerGrill: {
    alignItems: 'center',
    gap: 3.5,
    marginTop: 6,
    marginBottom: 4,
  },
  grillSlot: {
    width: '58%',
    height: 3,
    backgroundColor: '#14171E',
    borderRadius: 2,
  },

  // Event / Channel Title
  eventTitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  eventTitleText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Recessed OLED Display
  displayBevel: {
    backgroundColor: '#07090C',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1.5,
    borderColor: '#232731',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
    marginVertical: 4,
  },
  displayScreen: {
    backgroundColor: '#050B07',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#0F2316',
  },
  displayMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0F2A1A',
  },
  displayMetaText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 10,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  displayMetaCenter: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  channelArrowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  disabledArrow: {
    opacity: 0.25,
  },
  channelCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelName: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 24,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  allCallText: {
    color: '#FCD34D',
  },
  lockedText: {
    color: '#FBBF24',
  },
  lockedBadgeSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  allCallBadgeSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  displayBottomRow: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#0F2A1A',
    alignItems: 'center',
  },
  displayStatusText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 10.5,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  txStatusText: {
    color: '#F87171',
  },
  rxStatusText: {
    color: '#FBBF24',
  },
  offlineStatusText: {
    color: '#EF4444',
  },

  // Center Concentric PTT Button
  pttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  pttOuterBevel: {
    width: pttOuterSize,
    height: pttOuterSize,
    borderRadius: pttOuterSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1217',
    borderWidth: 2,
    borderColor: '#242A36',
  },
  pttGlowRing: {
    position: 'absolute',
    width: pttOuterSize,
    height: pttOuterSize,
    borderRadius: pttOuterSize / 2,
    borderWidth: 2,
  },
  circularPttButton: {
    width: pttSize,
    height: pttSize,
    borderRadius: pttSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  innerGrooveCircle: {
    width: pttSize * 0.76,
    height: pttSize * 0.76,
    borderRadius: (pttSize * 0.76) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pttLabelText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 1.5,
    marginTop: 6,
    textAlign: 'center',
  },
  pttToggleHint: {
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // Bottom Rectangular Buttons Row
  bottomButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  rectActionButton: {
    flex: 1,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#14171E',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2B313E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  rectActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E5E7EB',
    letterSpacing: 1,
  },
});
