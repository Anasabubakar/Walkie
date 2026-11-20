package expo.modules.walkiecore

import android.util.Log

interface ExpoWalkieCoreNativeCallbacks {
    fun onConnected(eventId: String, eventName: String, channelsJson: String, epoch: Int)
    fun onDisconnected(reason: String)
    fun onFloorGranted(reqId: String, channelId: String, leaseId: String, epoch: Int)
    fun onFloorBusy(channelId: String, holderName: String)
    fun onFloorRevoked(channelId: String, leaseId: String, reason: String)
    fun onSpeakerChanged(channelId: String, speakerId: String?, speakerName: String?)
    fun onIncomingAudioFrame(pcmData: ByteArray)
    fun onMemberCountChanged(count: Int)
}

object ExpoWalkieCoreNative {
    private const val TAG = "ExpoWalkieCoreNative"

    init {
        try {
            System.loadLibrary("walkie_core")
            Log.i(TAG, "libwalkie_core.so loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load libwalkie_core.so", e)
        }
    }

    @JvmStatic
    external fun nativeInitCallbacks(callbacks: ExpoWalkieCoreNativeCallbacks): Boolean

    @JvmStatic
    external fun nativeStartHost(
        baseDir: String,
        eventName: String,
        channelsJson: String,
        port: Int
    ): String

    @JvmStatic
    external fun nativeStopHost(): Boolean

    @JvmStatic
    external fun nativeGenerateAdmissionToken(role: String, ttlHours: Long): String

    @JvmStatic
    external fun nativeRevokeDevice(deviceId: String, reason: String): Boolean

    @JvmStatic
    external fun nativeStartClient(
        endpoint: String,
        token: String,
        deviceId: String,
        displayName: String,
        channelId: String
    ): Boolean

    @JvmStatic
    external fun nativeStopClient(): Boolean

    @JvmStatic
    external fun nativeSelectChannel(channelId: String): Boolean

    @JvmStatic
    external fun nativeRequestFloor(reqId: String): Boolean

    @JvmStatic
    external fun nativeReleaseFloor(): Boolean

    @JvmStatic
    external fun nativeSendAudioFrame(audioData: ByteArray, length: Int): Boolean

    @JvmStatic
    external fun nativeGetDiagnostics(): String
}
