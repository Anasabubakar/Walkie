package expo.modules.walkiecore

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.walkiecore.audio.WalkieAudioEngine
import expo.modules.walkiecore.model.ChannelData
import expo.modules.walkiecore.model.EventData
import expo.modules.walkiecore.service.WalkieDutyService
import org.json.JSONArray
import org.json.JSONObject
import java.net.NetworkInterface
import java.util.UUID

class ExpoWalkieCoreModule : Module() {

    companion object {
        private const val TAG = "ExpoWalkieCoreModule"
        private const val DEFAULT_PORT = 8443
    }

    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is null")

    private var audioEngine: WalkieAudioEngine? = null

    private var currentChannelId: String = "ch_stage"
    private var currentChannelName: String = "Stage"
    private var clientId: String = UUID.randomUUID().toString()
    private var myDisplayName: String = "Me"
    private var activeLeaseId: String? = null
    private var currentEpoch: Long = 1
    private var activeEventConfig: EventData? = null

    override fun definition() = ModuleDefinition {
        Name("ExpoWalkieCore")

        Events(
            "onStateChange",
            "onFloorChange",
            "onSpeakerChange",
            "onChannelListUpdate",
            "onNetworkStatusUpdate",
            "onMemberUpdate",
            "onAudioLevel"
        )

        OnCreate {
            if (!ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                Log.e(TAG, "Cannot init native callbacks: libwalkie_core.so is not loaded on this architecture")
                return@OnCreate
            }
            try {
                ExpoWalkieCoreNative.nativeInitCallbacks(object : ExpoWalkieCoreNativeCallbacks {
                    override fun onConnected(eventId: String, eventName: String, channelsJson: String, epoch: Int) {
                        currentEpoch = epoch.toLong()
                        val channelsList = parseChannelsJson(channelsJson)
                        sendEvent("onNetworkStatusUpdate", mapOf("connected" to true, "eventName" to eventName))
                        sendEvent("onChannelListUpdate", mapOf("channels" to channelsList.map {
                            mapOf("id" to it.id, "name" to it.name, "isPreset" to it.isPreset)
                        }))
                        updateDutyServiceState(connected = true)
                    }

                    override fun onDisconnected(reason: String) {
                        activeLeaseId = null
                        audioEngine?.stopCapture()
                        sendEvent("onNetworkStatusUpdate", mapOf("connected" to false, "reason" to reason))
                        sendEvent("onFloorChange", mapOf("floorState" to "DISCONNECTED", "channelId" to currentChannelId))
                        updateDutyServiceState(connected = false, talking = false)
                    }

                    override fun onFloorGranted(reqId: String, channelId: String, leaseId: String, epoch: Int) {
                        activeLeaseId = leaseId
                        currentEpoch = epoch.toLong()
                        audioEngine?.playChirp("GRANT")
                        audioEngine?.startCapture()
                        sendEvent("onFloorChange", mapOf(
                            "floorState" to "TRANSMITTING",
                            "channelId" to channelId,
                            "leaseId" to leaseId
                        ))
                        updateDutyServiceState(talking = true)
                    }

                    override fun onFloorBusy(channelId: String, holderName: String) {
                        audioEngine?.playChirp("BUSY")
                        sendEvent("onFloorChange", mapOf(
                            "floorState" to "BUSY",
                            "channelId" to channelId,
                            "holderName" to holderName
                        ))
                    }

                    override fun onFloorRevoked(channelId: String, leaseId: String, reason: String) {
                        activeLeaseId = null
                        audioEngine?.stopCapture()
                        audioEngine?.playChirp("TIMEOUT")
                        sendEvent("onFloorChange", mapOf(
                            "floorState" to "IDLE",
                            "channelId" to channelId
                        ))
                        updateDutyServiceState(talking = false)
                    }

                    override fun onSpeakerChanged(channelId: String, speakerId: String?, speakerName: String?) {
                        sendEvent("onSpeakerChange", mapOf(
                            "channelId" to channelId,
                            "speakerId" to speakerId,
                            "speakerName" to speakerName
                        ))
                        updateDutyServiceState(speakerName = speakerName)
                    }

                    override fun onIncomingAudioFrame(pcmData: ByteArray) {
                        audioEngine?.playIncomingAudioFrame(pcmData)
                    }

                    override fun onMemberCountChanged(count: Int) {
                        sendEvent("onMemberUpdate", mapOf("count" to count))
                    }
                })
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to initialize native callbacks: ${e.message}", e)
            }

            WalkieDutyService.onLockScreenTalkToggled = {
                toggleFloorFromLockScreen()
            }
        }

        OnDestroy {
            cleanupAll()
        }

        // --- Core Push-to-Talk & Radio Methods ---

        Function("requestFloor") {
            val reqId = "req_${System.currentTimeMillis()}"
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeRequestFloor(reqId)
            }
            reqId
        }

        Function("releaseFloor") {
            if (activeLeaseId != null || WalkieDutyService.isTalkingState) {
                if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                    ExpoWalkieCoreNative.nativeReleaseFloor()
                }
                activeLeaseId = null
                audioEngine?.stopCapture()
                sendEvent("onFloorChange", mapOf("floorState" to "IDLE", "channelId" to currentChannelId))
                updateDutyServiceState(talking = false)
            }
            true
        }

        Function("selectChannel") { channelId: String ->
            currentChannelId = channelId
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeSelectChannel(channelId)
            }
            updateDutyServiceState()
            true
        }

        Function("setAudioRoute") { route: String ->
            audioEngine?.setAudioRoute(route)
            true
        }

        Function("playChirp") { type: String ->
            audioEngine?.playChirp(type)
            true
        }

        // --- Host & Client Lifecycle ---

        AsyncFunction("startHost") { eventName: String, channelsJson: String, promise: Promise ->
            if (!ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                promise.reject("NATIVE_NOT_LOADED", "Native engine walkie_core is not loaded", null)
                return@AsyncFunction
            }
            try {
                cleanupAll()
                val baseDir = context.filesDir.absolutePath
                val port = DEFAULT_PORT

                val configJsonStr = ExpoWalkieCoreNative.nativeStartHost(
                    baseDir = baseDir,
                    eventName = eventName,
                    channelsJson = channelsJson,
                    port = port
                )

                if (configJsonStr.isEmpty()) {
                    promise.reject("START_HOST_FAILED", "Failed to start Rust host server", null)
                    return@AsyncFunction
                }

                val configObj = JSONObject(configJsonStr)
                val eventId = configObj.getString("eventId")
                val admissionToken = configObj.getString("admissionToken")
                val hostFingerprint = configObj.getString("hostFingerprint")
                val channelsList = parseChannelsJson(channelsJson)

                val localIp = getLocalWifiIpAddress()
                val hostEndpoint = "$localIp:$port"

                activeEventConfig = EventData(
                    eventId = eventId,
                    name = eventName,
                    hostEndpoint = hostEndpoint,
                    hostFingerprint = hostFingerprint,
                    admissionToken = admissionToken,
                    channels = channelsList
                )

                initAudioEngine()
                currentChannelId = channelsList.firstOrNull()?.id ?: "ch_stage"
                currentChannelName = channelsList.firstOrNull()?.name ?: "Stage"

                ExpoWalkieCoreNative.nativeStartClient(
                    endpoint = "127.0.0.1:$port",
                    token = admissionToken,
                    deviceId = clientId,
                    displayName = "Organizer",
                    channelId = currentChannelId
                )

                startDutyService(currentChannelName)

                promise.resolve(mapOf(
                    "eventId" to eventId,
                    "name" to eventName,
                    "hostEndpoint" to hostEndpoint,
                    "hostFingerprint" to hostFingerprint,
                    "admissionToken" to admissionToken,
                    "channels" to channelsList.map { mapOf("id" to it.id, "name" to it.name, "isPreset" to it.isPreset) }
                ))
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start host: ${e.message}", e)
                promise.reject("START_HOST_FAILED", e.message, e)
            }
        }

        AsyncFunction("stopHost") { promise: Promise ->
            try {
                if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                    ExpoWalkieCoreNative.nativeStopHost()
                }
                cleanupAll()
                stopDutyService()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_HOST_FAILED", e.message, e)
            }
        }

        AsyncFunction("joinEvent") { endpoint: String, token: String, hostFingerprint: String, displayName: String, channelId: String, promise: Promise ->
            if (!ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                promise.reject("NATIVE_NOT_LOADED", "Native engine walkie_core is not loaded", null)
                return@AsyncFunction
            }
            try {
                cleanupAll()
                myDisplayName = displayName
                currentChannelId = channelId

                initAudioEngine()
                val success = ExpoWalkieCoreNative.nativeStartClient(
                    endpoint = endpoint,
                    token = token,
                    deviceId = clientId,
                    displayName = displayName,
                    channelId = channelId
                )

                if (success) {
                    startDutyService(currentChannelName)
                    promise.resolve(true)
                } else {
                    promise.reject("JOIN_FAILED", "Failed to connect to host", null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to join event: ${e.message}", e)
                promise.reject("JOIN_FAILED", e.message, e)
            }
        }

        AsyncFunction("leaveEvent") { promise: Promise ->
            try {
                cleanupAll()
                stopDutyService()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("LEAVE_FAILED", e.message, e)
            }
        }

        Function("getDiagnostics") {
            val diagJson = if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeGetDiagnostics()
            } else {
                "{}"
            }
            val localIp = getLocalWifiIpAddress()
            val hostEp = activeEventConfig?.hostEndpoint ?: "Connected"

            try {
                val obj = JSONObject(diagJson)
                mapOf(
                    "localIp" to localIp,
                    "hostEndpoint" to hostEp,
                    "rttMs" to obj.optInt("rttMs", 0),
                    "jitterMs" to obj.optDouble("jitterMs", 0.0),
                    "packetsSent" to obj.optInt("packetsSent", 0),
                    "packetsReceived" to obj.optInt("packetsReceived", 0)
                )
            } catch (e: Exception) {
                mapOf(
                    "localIp" to localIp,
                    "hostEndpoint" to hostEp,
                    "rttMs" to 0,
                    "jitterMs" to 0.0,
                    "packetsSent" to 0,
                    "packetsReceived" to 0
                )
            }
        }

        Function("getActiveEventConfig") {
            val config = activeEventConfig
            if (config != null) {
                mapOf(
                    "eventId" to config.eventId,
                    "name" to config.name,
                    "hostEndpoint" to config.hostEndpoint,
                    "hostFingerprint" to config.hostFingerprint,
                    "admissionToken" to config.admissionToken,
                    "channels" to config.channels.map { mapOf("id" to it.id, "name" to it.name, "isPreset" to it.isPreset) }
                )
            } else null
        }

        Function("rotateAdmissionToken") {
            if (!ExpoWalkieCoreNative.isNativeLibraryLoaded) return@Function ""
            val newToken = ExpoWalkieCoreNative.nativeGenerateAdmissionToken("crew", 24)
            val current = activeEventConfig
            if (current != null) {
                activeEventConfig = current.copy(admissionToken = newToken)
            }
            newToken
        }

        Function("revokeMember") { clientIdToRevoke: String, reason: String ->
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeRevokeDevice(clientIdToRevoke, reason)
            }
            true
        }
    }

    private fun initAudioEngine() {
        try {
            audioEngine?.release()
            audioEngine = WalkieAudioEngine(
                context = context,
                onAudioFrameCaptured = { pcmBuffer, length ->
                    if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                        ExpoWalkieCoreNative.nativeSendAudioFrame(pcmBuffer, length)
                    }
                },
                onAudioFocusLost = {
                    releaseFloorFromNative()
                }
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize WalkieAudioEngine: ${e.message}", e)
        }
    }

    private fun toggleFloorFromLockScreen() {
        if (activeLeaseId != null) {
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeReleaseFloor()
            }
            activeLeaseId = null
            audioEngine?.stopCapture()
            sendEvent("onFloorChange", mapOf("floorState" to "IDLE", "channelId" to currentChannelId))
            updateDutyServiceState(talking = false)
        } else {
            val reqId = "req_lock_${System.currentTimeMillis()}"
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeRequestFloor(reqId)
            }
            sendEvent("onFloorChange", mapOf("floorState" to "REQUESTING", "channelId" to currentChannelId))
        }
    }

    private fun releaseFloorFromNative() {
        if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
            ExpoWalkieCoreNative.nativeReleaseFloor()
        }
        activeLeaseId = null
        audioEngine?.stopCapture()
        sendEvent("onFloorChange", mapOf("floorState" to "IDLE", "channelId" to currentChannelId))
        updateDutyServiceState(talking = false)
    }

    private fun startDutyService(channelName: String) {
        try {
            val intent = Intent(context, WalkieDutyService::class.java).apply {
                action = WalkieDutyService.ACTION_START_SERVICE
                putExtra("channel_name", channelName)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start duty service: ${e.message}")
        }
    }

    private fun stopDutyService() {
        try {
            val intent = Intent(context, WalkieDutyService::class.java).apply {
                action = WalkieDutyService.ACTION_STOP_SERVICE
            }
            context.startService(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to stop duty service: ${e.message}")
        }
    }

    private fun updateDutyServiceState(
        speakerName: String? = null,
        connected: Boolean = true,
        talking: Boolean = WalkieDutyService.isTalkingState
    ) {
        try {
            WalkieDutyService.instance?.updateNotificationState(
                channelName = currentChannelName,
                speakerName = speakerName,
                connected = connected,
                talking = talking
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update duty service state: ${e.message}")
        }
    }

    private fun parseChannelsJson(channelsJson: String): List<ChannelData> {
        val list = mutableListOf<ChannelData>()
        try {
            val array = JSONArray(channelsJson)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(ChannelData(
                    id = obj.getString("id"),
                    name = obj.getString("name"),
                    isPreset = obj.optBoolean("isPreset", false)
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing channels JSON: ${e.message}")
        }
        return list
    }

    private fun cleanupAll() {
        try {
            if (ExpoWalkieCoreNative.isNativeLibraryLoaded) {
                ExpoWalkieCoreNative.nativeStopClient()
            }
        } catch (ignored: Exception) {}
        audioEngine?.release()
        audioEngine = null
        activeLeaseId = null
    }

    private fun getLocalWifiIpAddress(): String {
        try {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ipInt = wm?.connectionInfo?.ipAddress ?: 0
            if (ipInt != 0) {
                return String.format(
                    java.util.Locale.US,
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "WifiManager IP resolution error: ${e.message}")
        }

        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
            val sorted = interfaces.sortedByDescending { it.name.startsWith("wlan") || it.name.startsWith("ap") }
            for (iface in sorted) {
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val host = addr.hostAddress
                        if (host != null && !host.startsWith("127.")) {
                            return host
                        }
                    }
                }
            }
        } catch (ignored: Exception) {}
        return "127.0.0.1"
    }
}
