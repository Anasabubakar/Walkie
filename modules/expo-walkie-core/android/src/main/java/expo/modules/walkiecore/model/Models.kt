package expo.modules.walkiecore.model

data class ChannelData(
    val id: String = "",
    val name: String = "",
    val isPreset: Boolean = false
) {
    // Convenience constructor
    constructor(id: String, name: String) : this(id, name, false)
}

data class EventData(
    val eventId: String,
    val name: String,
    val hostEndpoint: String,
    val hostFingerprint: String,
    val admissionToken: String,
    val channels: List<ChannelData>
)

data class FloorLease(
    val channelId: String,
    val leaseId: String,
    val epoch: Long,
    val grantedTo: String,
    val holderName: String,
    val startTimeMs: Long,
    val maxDurationMs: Long = 30000L
)

data class ClientSession(
    val id: String,
    val displayName: String,
    var currentChannelId: String,
    val ipAddress: String,
    val connectedAt: Long,
    var lastPingAt: Long,
    var isRevoked: Boolean = false
)
