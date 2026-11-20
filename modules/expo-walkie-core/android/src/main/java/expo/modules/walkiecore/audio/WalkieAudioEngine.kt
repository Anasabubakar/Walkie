package expo.modules.walkiecore.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

class WalkieAudioEngine(
    private val context: Context,
    private val onAudioFrameCaptured: (ByteArray, Int) -> Unit,
    private val onAudioFocusLost: () -> Unit
) {
    companion object {
        private const val TAG = "WalkieAudioEngine"
        const val SAMPLE_RATE = 16000
        const val CHANNEL_CONFIG_IN = AudioFormat.CHANNEL_IN_MONO
        const val CHANNEL_CONFIG_OUT = AudioFormat.CHANNEL_OUT_MONO
        const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        const val FRAME_SIZE_SAMPLES = 320 // 20ms at 16kHz
        const val FRAME_SIZE_BYTES = FRAME_SIZE_SAMPLES * 2 // 640 bytes
        const val HEADER_SIZE = 15
    }

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private val isRecording = AtomicBoolean(false)
    private val isPlaying = AtomicBoolean(false)
    private var recordThread: Thread? = null

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                Log.w(TAG, "Audio focus lost! Stopping capture.")
                stopCapture()
                onAudioFocusLost()
            }
        }
    }

    init {
        initAudioTrack()
    }

    private fun initAudioTrack() {
        val minBufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            CHANNEL_CONFIG_OUT,
            AUDIO_FORMAT
        )
        val bufferSize = maxOf(minBufferSize, FRAME_SIZE_BYTES * 4)

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        val format = AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)
            .setEncoding(AUDIO_FORMAT)
            .setChannelMask(CHANNEL_CONFIG_OUT)
            .build()

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferSize)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        audioTrack?.play()
        isPlaying.set(true)
    }

    @SuppressLint("MissingPermission")
    fun startCapture(): Boolean {
        if (isRecording.get()) return true

        // Request audio focus
        val focusResult = audioManager.requestAudioFocus(
            focusChangeListener,
            AudioManager.STREAM_VOICE_CALL,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
        )
        if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            Log.w(TAG, "Failed to acquire audio focus")
            return false
        }

        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

        val minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            CHANNEL_CONFIG_IN,
            AUDIO_FORMAT
        )
        val bufferSize = maxOf(minBufferSize, FRAME_SIZE_BYTES * 4)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                CHANNEL_CONFIG_IN,
                AUDIO_FORMAT,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                return false
            }

            audioRecord?.startRecording()
            isRecording.set(true)

            recordThread = Thread {
                val pcmBuffer = ByteArray(FRAME_SIZE_BYTES)

                while (isRecording.get()) {
                    val read = audioRecord?.read(pcmBuffer, 0, FRAME_SIZE_BYTES) ?: -1
                    if (read > 0) {
                        onAudioFrameCaptured(pcmBuffer, read)
                    }
                }
            }.apply {
                priority = Thread.MAX_PRIORITY
                start()
            }

            return true
        } catch (e: Exception) {
            Log.e(TAG, "Exception starting audio capture: ${e.message}", e)
            isRecording.set(false)
            return false
        }
    }

    fun stopCapture() {
        if (!isRecording.getAndSet(false)) return

        try {
            recordThread?.interrupt()
            recordThread = null
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            audioManager.abandonAudioFocus(focusChangeListener)
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping audio capture: ${e.message}")
        }
    }

    fun playIncomingAudioFrame(data: ByteArray) {
        if (data.size <= HEADER_SIZE) return
        val offset = HEADER_SIZE
        val length = data.size - HEADER_SIZE
        audioTrack?.write(data, offset, length)
    }

    fun setAudioRoute(route: String) {
        when (route.uppercase()) {
            "SPEAKER" -> {
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                audioManager.isSpeakerphoneOn = true
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
            }
            "EARPIECE" -> {
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                audioManager.isSpeakerphoneOn = false
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
            }
            "BLUETOOTH" -> {
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                audioManager.isSpeakerphoneOn = false
                audioManager.startBluetoothSco()
                audioManager.isBluetoothScoOn = true
            }
        }
    }

    fun playChirp(type: String) {
        Thread {
            when (type.uppercase()) {
                "GRANT" -> playToneSequence(listOf(Pair(880, 50), Pair(1760, 60)))
                "BUSY" -> playToneSequence(listOf(Pair(300, 90)))
                "TIMEOUT" -> playToneSequence(listOf(Pair(440, 40), Pair(440, 40), Pair(440, 50)))
            }
        }.start()
    }

    private fun playToneSequence(tones: List<Pair<Int, Int>>) {
        val totalMs = tones.sumOf { it.second }
        val totalSamples = (SAMPLE_RATE * totalMs) / 1000
        val pcm = ByteArray(totalSamples * 2)

        var offset = 0
        for ((freq, durationMs) in tones) {
            val samples = (SAMPLE_RATE * durationMs) / 1000
            for (i in 0 until samples) {
                val angle = 2.0 * Math.PI * i / (SAMPLE_RATE.toDouble() / freq)
                val sampleVal = (Math.sin(angle) * 28000).toInt().toShort()
                val idx = (offset + i) * 2
                if (idx + 1 < pcm.size) {
                    pcm[idx] = (sampleVal.toInt() and 0xff).toByte()
                    pcm[idx + 1] = ((sampleVal.toInt() shr 8) and 0xff).toByte()
                }
            }
            offset += samples
        }

        audioTrack?.write(pcm, 0, pcm.size)
    }

    fun release() {
        stopCapture()
        audioTrack?.stop()
        audioTrack?.release()
        audioTrack = null
    }
}
