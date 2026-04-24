// SharedModels.swift
// Add to BOTH the SpinFlipRoll (iOS) and SpinFlipRollWatch (watchOS) targets.
import Foundation

struct SharedWheelList: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var entries: [SharedEntry]

    init(id: UUID = UUID(), name: String, entries: [SharedEntry] = []) {
        self.id = id
        self.name = name
        self.entries = entries
    }
}

struct SharedEntry: Codable, Identifiable, Hashable {
    var id: UUID
    var label: String
    var colorHex: String
    var weight: Double

    init(id: UUID = UUID(), label: String, colorHex: String, weight: Double = 1.0) {
        self.id = id
        self.label = label
        self.colorHex = colorHex
        self.weight = weight
    }
}
