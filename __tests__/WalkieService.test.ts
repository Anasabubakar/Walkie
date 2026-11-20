/**
 * Unit Tests for WalkieService
 */

// Mock expo-modules-core before importing WalkieService
jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
}));

import WalkieService from '../src/services/WalkieService';

// Mock ExpoWalkieCoreModule and Haptics
jest.mock('expo-walkie-core', () => ({
  __esModule: true,
  default: {
    startHost: jest.fn().mockResolvedValue({
      eventId: 'evt_test_001',
      name: 'Rehearsal Main',
      hostEndpoint: '192.168.1.50:8443',
      hostFingerprint: 'mock_fp_123',
      admissionToken: 'mock_tok_456',
      channels: [
        { id: 'ch_stage', name: 'Stage', isPreset: true },
        { id: 'ch_prod', name: 'Production', isPreset: true },
        { id: 'ch_front', name: 'Front Desk', isPreset: true },
      ],
    }),
    stopHost: jest.fn().mockResolvedValue(true),
    joinEvent: jest.fn().mockResolvedValue(true),
    leaveEvent: jest.fn().mockResolvedValue(true),
    selectChannel: jest.fn().mockReturnValue(true),
    requestFloor: jest.fn().mockReturnValue(true),
    releaseFloor: jest.fn().mockReturnValue(true),
    setAudioRoute: jest.fn().mockReturnValue(true),
    playChirp: jest.fn().mockReturnValue(true),
    getDiagnostics: jest.fn().mockReturnValue({
      localIp: '192.168.1.50',
      hostEndpoint: '192.168.1.50:8443',
      rttMs: 8,
      packetsSent: 10,
      packetsReceived: 10,
      packetLossRate: 0.0,
      jitterMs: 1.2,
      lastGrantLatencyMs: 95,
    }),
    rotateAdmissionToken: jest.fn().mockReturnValue('tok_new_rotated'),
    revokeMember: jest.fn().mockReturnValue(true),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'Heavy', Light: 'Light' },
  NotificationFeedbackType: { Error: 'Error' },
}));

describe('WalkieService', () => {
  let service: WalkieService;

  beforeEach(() => {
    service = WalkieService.getInstance();
  });

  test('initializes with default preset channels and OFFLINE state', () => {
    expect(service.channels.length).toBe(3);
    expect(service.channels.map((c) => c.name)).toEqual(['Stage', 'Production', 'Front Desk']);
    expect(service.currentChannel.name).toBe('Stage');
    expect(service.connectionState).toBe('OFFLINE');
    expect(service.floorState).toBe('IDLE');
  });

  test('channel switching cycles forward and backward across channels', () => {
    expect(service.currentChannel.id).toBe('ch_stage');

    service.switchChannel('next');
    expect(service.currentChannel.id).toBe('ch_prod');

    service.switchChannel('next');
    expect(service.currentChannel.id).toBe('ch_front');

    // Cycle back to beginning
    service.switchChannel('next');
    expect(service.currentChannel.id).toBe('ch_stage');

    // Previous cycles to last
    service.switchChannel('prev');
    expect(service.currentChannel.id).toBe('ch_front');
  });

  test('startHost configures organizer role and CONNECTED state', async () => {
    const config = await service.startHost('Rehearsal Main');

    expect(service.role).toBe('organizer');
    expect(service.connectionState).toBe('CONNECTED');
    expect(config.eventId).toBe('evt_test_001');
    expect(config.hostEndpoint).toBe('192.168.1.50:8443');
    expect(service.eventConfig).not.toBeNull();
  });

  test('stopHost clears organizer session and returns to OFFLINE', async () => {
    await service.stopHost();

    expect(service.role).toBeNull();
    expect(service.connectionState).toBe('OFFLINE');
    expect(service.eventConfig).toBeNull();
  });

  test('joinEvent configures crew role and CONNECTED state', async () => {
    await service.joinEvent(
      '192.168.1.50:8443',
      'tok_abc',
      'fp_xyz',
      'Lighting Lead',
      'ch_stage'
    );

    expect(service.role).toBe('crew');
    expect(service.connectionState).toBe('CONNECTED');
  });

  test('audio settings toggles update properly', () => {
    const initialChirps = service.audioSettings.chirpsEnabled;
    service.toggleChirps();
    expect(service.audioSettings.chirpsEnabled).toBe(!initialChirps);

    const initialHaptics = service.audioSettings.hapticsEnabled;
    service.toggleHaptics();
    expect(service.audioSettings.hapticsEnabled).toBe(!initialHaptics);

    service.setAudioRoute('EARPIECE');
    expect(service.audioSettings.route).toBe('EARPIECE');

    service.setAccessibilityMode('TAP_TOGGLE');
    expect(service.audioSettings.accessibilityPttMode).toBe('TAP_TOGGLE');
  });

  test('refreshDiagnostics fetches live network statistics', () => {
    const diag = service.refreshDiagnostics();
    expect(diag.localIp).toBe('192.168.1.50');
    expect(diag.rttMs).toBe(8);
  });
});
