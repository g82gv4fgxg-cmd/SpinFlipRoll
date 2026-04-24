// Models.swift — iOS target only (SpinFlipRoll)
import Foundation
import SwiftData

@Model
final class WheelList {
    var name: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade) var entries: [WheelEntry]
    @Relationship(deleteRule: .cascade) var results: [SpinResult]

    init(name: String) {
        self.name = name
        self.createdAt = Date()
        self.entries = []
        self.results = []
    }

    var sortedEntries: [WheelEntry] {
        entries.sorted { $0.order < $1.order }
    }

    /// Returns the palette colour least used so far (avoids adjacent repeats).
    func nextColorHex() -> String {
        let counts = Dictionary(grouping: entries, by: \.colorHex).mapValues(\.count)
        let prev = sortedEntries.last?.colorHex
        return WheelMath.palette
            .filter { $0 != prev }
            .min { (counts[$0] ?? 0) < (counts[$1] ?? 0) }
            ?? WheelMath.palette[entries.count % WheelMath.palette.count]
    }

    func toShared() -> SharedWheelList {
        SharedWheelList(
            name: name,
            entries: sortedEntries.map {
                SharedEntry(label: $0.label, colorHex: $0.colorHex, weight: $0.weight)
            }
        )
    }
}

@Model
final class WheelEntry {
    var label: String
    var colorHex: String
    var weight: Double
    var order: Int

    init(label: String, colorHex: String, weight: Double = 1.0, order: Int = 0) {
        self.label = label
        self.colorHex = colorHex
        self.weight = weight
        self.order = order
    }
}

@Model
final class SpinResult {
    var label: String
    var listName: String
    var timestamp: Date

    init(label: String, listName: String) {
        self.label = label
        self.listName = listName
        self.timestamp = Date()
    }
}
