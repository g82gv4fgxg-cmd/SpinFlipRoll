// Color+Hex.swift
// Add to BOTH the SpinFlipRoll (iOS) and SpinFlipRollWatch (watchOS) targets.
import SwiftUI

extension Color {
    init(hex: String) {
        var h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if h.count == 3 { h = h.flatMap { ["\($0)", "\($0)"] }.joined() }
        let val = UInt64(h.count == 6 ? h : "888888", radix: 16) ?? 0x888888
        self.init(
            red:   Double((val >> 16) & 0xFF) / 255,
            green: Double((val >> 8)  & 0xFF) / 255,
            blue:  Double( val        & 0xFF) / 255
        )
    }
}
