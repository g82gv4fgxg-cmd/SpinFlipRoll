// PhoneConnectivityManager.swift — iOS target
// Sends the current wheel lists to the paired Apple Watch whenever they change.
import Foundation
import WatchConnectivity
import SwiftData

final class PhoneConnectivityManager: NSObject, WCSessionDelegate {
    static let shared = PhoneConnectivityManager()
    private var modelContext: ModelContext?

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Call this after inserting a ModelContext (from the App scene).
    func configure(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    /// Encode current lists and send to watch if it's reachable.
    func syncLists() {
        guard WCSession.default.activationState == .activated else { return }
        guard let ctx = modelContext else { return }

        let descriptor = FetchDescriptor<WheelList>()
        guard let lists = try? ctx.fetch(descriptor) else { return }

        let shared = lists.map { $0.toShared() }
        guard let data = try? JSONEncoder().encode(shared) else { return }

        if WCSession.default.isReachable {
            WCSession.default.sendMessageData(data, replyHandler: nil, errorHandler: nil)
        } else {
            // Persist in application context so watch gets it on next launch
            try? WCSession.default.updateApplicationContext(["lists": data.base64EncodedString()])
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if activationState == .activated { syncLists() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if message["requestSync"] as? Bool == true { syncLists() }
    }
}
