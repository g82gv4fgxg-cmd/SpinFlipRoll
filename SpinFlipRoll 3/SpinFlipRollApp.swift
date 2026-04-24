// SpinFlipRollApp.swift — iOS target
import SwiftUI
import SwiftData

@main
struct SpinFlipRollApp: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([WheelList.self, WheelEntry.self, SpinResult.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(sharedModelContainer)
    }
}
