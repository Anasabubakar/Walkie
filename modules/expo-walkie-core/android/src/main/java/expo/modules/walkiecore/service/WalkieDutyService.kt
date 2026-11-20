package expo.modules.walkiecore.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class WalkieDutyService : Service() {

    companion object {
        private const val TAG = "WalkieDutyService"
        const val CHANNEL_ID = "walkie_duty_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_SERVICE = "expo.modules.walkiecore.ACTION_START"
        const val ACTION_STOP_SERVICE = "expo.modules.walkiecore.ACTION_STOP"
        const val ACTION_TOGGLE_TALK = "expo.modules.walkiecore.ACTION_TOGGLE_TALK"
        const val ACTION_UPDATE_STATE = "expo.modules.walkiecore.ACTION_UPDATE_STATE"

        var instance: WalkieDutyService? = null
            private set

        var isTalkingState: Boolean = false
            private set

        // Handler hook provided by WalkieCoreModule
        var onLockScreenTalkToggled: (() -> Unit)? = null
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var currentChannelName: String = "Stage"
    private var activeSpeakerName: String? = null
    private var isConnected: Boolean = true

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        acquireLocks()
        Log.i(TAG, "WalkieDutyService created and locks acquired")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_SERVICE -> {
                try {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping foreground: ${e.message}")
                }
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_TALK -> {
                Log.i(TAG, "Lock screen talk action triggered")
                onLockScreenTalkToggled?.invoke()
            }
            ACTION_UPDATE_STATE -> {
                currentChannelName = intent.getStringExtra("channel_name") ?: currentChannelName
                activeSpeakerName = intent.getStringExtra("speaker_name")
                isConnected = intent.getBooleanExtra("is_connected", true)
                isTalkingState = intent.getBooleanExtra("is_talking", false)
                updateNotification()
            }
            else -> {
                startDutyForeground()
            }
        }
        return START_STICKY
    }

    private fun startDutyForeground() {
        try {
            val notification = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                val hasAudioPermission = ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED

                if (hasAudioPermission) {
                    fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    startForeground(NOTIFICATION_ID, notification, fgsType)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service: ${e.message}", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseLocks()
        instance = null
        Log.i(TAG, "WalkieDutyService destroyed and locks released")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Walkie Active Duty",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Keeps Walkie connected to venue radio channels while locked"
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                val nm = getSystemService(NotificationManager::class.java)
                nm?.createNotificationChannel(channel)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to create notification channel: ${e.message}")
            }
        }
    }

    private fun buildNotification(): Notification {
        val toggleIntent = Intent(this, WalkieLockScreenReceiver::class.java).apply {
            action = ACTION_TOGGLE_TALK
        }
        val togglePending = PendingIntent.getBroadcast(
            this,
            0,
            toggleIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val buttonLabel = if (isTalkingState) "STOP TRANSMITTING" else "HOLD / TAP TO TALK"

        val statusText = when {
            !isConnected -> "Reconnecting to venue host..."
            isTalkingState -> "You are transmitting"
            activeSpeakerName != null -> "Receiving: $activeSpeakerName"
            else -> "Connected • Floor Open"
        }

        val notifIcon = resources.getIdentifier("ic_stat_walkie", "drawable", packageName).let {
            if (it != 0) it else android.R.drawable.ic_btn_speak_now
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Walkie • $currentChannelName")
            .setContentText(statusText)
            .setSmallIcon(notifIcon)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(notifIcon, buttonLabel, togglePending)
            .build()
    }

    fun updateNotificationState(channelName: String, speakerName: String?, connected: Boolean, talking: Boolean) {
        currentChannelName = channelName
        activeSpeakerName = speakerName
        isConnected = connected
        isTalkingState = talking
        updateNotification()
    }

    private fun updateNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.notify(NOTIFICATION_ID, buildNotification())
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update notification: ${e.message}")
        }
    }

    private fun acquireLocks() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Walkie:DutyServiceWakeLock")?.apply {
                setReferenceCounted(false)
                acquire(24 * 60 * 60 * 1000L) // Safe 24hr timeout
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire wake lock: ${e.message}")
        }

        try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wm != null) {
                wifiLock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        wm.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "Walkie:WifiLowLatencyLock")
                    } catch (e: Exception) {
                        @Suppress("DEPRECATION")
                        wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Walkie:WifiHighPerfLock")
                    }
                } else {
                    @Suppress("DEPRECATION")
                    wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Walkie:WifiHighPerfLock")
                }.apply {
                    setReferenceCounted(false)
                    acquire()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire wifi lock: ${e.message}")
        }

        // Zero-WAN Guarantee: Bind process network to Wi-Fi to prevent Android from bypassing
        // local Wi-Fi router when the router has no internet connection (no WAN).
        try {
            val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            if (cm != null) {
                val builder = NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                val callback = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        super.onAvailable(network)
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                cm.bindProcessToNetwork(network)
                                Log.i(TAG, "Process bound to Wi-Fi for zero-WAN operation: $network")
                            } else {
                                @Suppress("DEPRECATION")
                                ConnectivityManager.setProcessDefaultNetwork(network)
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to bind process to Wi-Fi network: ${e.message}")
                        }
                    }

                    override fun onLost(network: Network) {
                        super.onLost(network)
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                if (cm.boundNetworkForProcess == network) {
                                    cm.bindProcessToNetwork(null)
                                }
                            } else {
                                @Suppress("DEPRECATION")
                                ConnectivityManager.setProcessDefaultNetwork(null)
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Error unbinding process from network: ${e.message}")
                        }
                    }
                }
                networkCallback = callback
                cm.registerNetworkCallback(builder.build(), callback)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to register Wi-Fi network callback: ${e.message}")
        }
    }

    private fun releaseLocks() {
        try {
            val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                cm?.bindProcessToNetwork(null)
            } else {
                @Suppress("DEPRECATION")
                ConnectivityManager.setProcessDefaultNetwork(null)
            }
            networkCallback?.let { cm?.unregisterNetworkCallback(it) }
            networkCallback = null
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering network callback: ${e.message}")
        }

        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing wake lock: ${e.message}")
        }

        try {
            wifiLock?.let {
                if (it.isHeld) {
                    it.release()
                }
            }
            wifiLock = null
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing wifi lock: ${e.message}")
        }
    }
}

class WalkieLockScreenReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == WalkieDutyService.ACTION_TOGGLE_TALK) {
            WalkieDutyService.onLockScreenTalkToggled?.invoke()
        }
    }
}
