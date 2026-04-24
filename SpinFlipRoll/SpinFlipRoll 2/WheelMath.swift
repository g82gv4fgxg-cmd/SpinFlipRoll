// WheelMath.swift
// Add to BOTH the SpinFlipRoll (iOS) and SpinFlipRollWatch (watchOS) targets.
import Foundation

enum WheelMath {
    static let palette = [
        "E05555", // red
        "F08020", // orange
        "F0B520", // yellow
        "2FA060", // green
        "3080D0", // blue
        "8855CC", // purple
        "CC4488", // pink
    ]

    struct Segment {
        let start: Double
        let end: Double
        let mid: Double
    }

    static func buildSegments(_ entries: [SharedEntry], weighted: Bool) -> [Segment] {
        guard !entries.isEmpty else { return [] }

        if weighted {
            let total = entries.reduce(0.0) { $0 + max($1.weight, 0) }
            let safe = total > 0 ? total : Double(entries.count)
            var cursor = -90.0
            return entries.map { entry in
                let w = total > 0 ? max(entry.weight, 0) : 1.0
                let angle = (w / safe) * 360.0
                let seg = Segment(start: cursor, end: cursor + angle, mid: cursor + angle / 2)
                cursor += angle
                return seg
            }
        } else {
            let slice = 360.0 / Double(entries.count)
            return entries.indices.map { i in
                let start = -90.0 + Double(i) * slice
                return Segment(start: start, end: start + slice, mid: start + slice / 2)
            }
        }
    }

    /// Returns the index of the winner, respecting optional weighted and no-repeat logic.
    static func pickWinner(
        _ entries: [SharedEntry],
        weighted: Bool,
        excluding: String? = nil
    ) -> Int {
        guard !entries.isEmpty else { return 0 }

        var pool = entries.indices.filter { excluding == nil || entries[$0].label != excluding }
        if pool.isEmpty { pool = Array(entries.indices) }

        guard weighted else { return pool.randomElement() ?? 0 }

        let total = pool.map { max(entries[$0].weight, 0) }.reduce(0, +)
        let rand = Double.random(in: 0..<(total > 0 ? total : Double(pool.count)))
        var cum = 0.0
        for idx in pool {
            cum += total > 0 ? max(entries[idx].weight, 0) : 1.0
            if rand < cum { return idx }
        }
        return pool.last ?? 0
    }

    /// Returns how many extra degrees to rotate so the chosen segment lands under the top pointer.
    static func spinDelta(winnerMid: Double, currentRotation: Double, spins: Int = 7) -> Double {
        let mod = currentRotation.truncatingRemainder(dividingBy: 360)
        let norm = mod < 0 ? mod + 360 : mod
        return Double(spins) * 360.0 + (-90.0 - winnerMid - norm)
    }
}
