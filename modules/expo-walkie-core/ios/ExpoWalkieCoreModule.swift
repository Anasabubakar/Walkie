import ExpoModulesCore

public class ExpoWalkieCoreModule: Module {
  public func definition() -> ModuleDefinition {
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

    AsyncFunction("startHost") { (eventName: String, channelsJson: String) -> [String: Any] in
      return [
        "eventId": "evt_ios_stub",
        "name": eventName,
        "hostEndpoint": "127.0.0.1:8443",
        "hostFingerprint": "mock_ios_fingerprint",
        "admissionToken": "mock_ios_token",
        "channels": []
      ]
    }

    AsyncFunction("stopHost") { () -> Bool in
      return true
    }

    AsyncFunction("joinEvent") { (endpoint: String, token: String, hostFingerprint: String, displayName: String, channelId: String) -> Bool in
      return true
    }

    AsyncFunction("leaveEvent") { () -> Bool in
      return true
    }

    Function("selectChannel") { (channelId: String) -> Bool in
      return true
    }

    Function("requestFloor") { () -> Bool in
      return true
    }

    Function("releaseFloor") { () -> Bool in
      return true
    }

    Function("setAudioRoute") { (route: String) -> Bool in
      return true
    }

    Function("playChirp") { (type: String) -> Bool in
      return true
    }

    Function("getDiagnostics") { () -> [String: Any] in
      return [
        "localIp": "127.0.0.1",
        "hostEndpoint": "Offline",
        "rttMs": 0,
        "packetsSent": 0,
        "packetsReceived": 0,
        "packetLossRate": 0.0,
        "jitterMs": 0.0,
        "lastGrantLatencyMs": 0
      ]
    }

    Function("getEventConfig") { () -> [String: Any]? in
      return nil
    }

    Function("rotateAdmissionToken") { () -> String in
      return "tok_rotated_ios"
    }

    Function("revokeMember") { (clientId: String, reason: String) -> Bool in
      return true
    }
  }
}
