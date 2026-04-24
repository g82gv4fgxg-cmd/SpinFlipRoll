// WheelCanvas.swift
// Add to BOTH the SpinFlipRoll (iOS) and SpinFlipRollWatch (watchOS) targets.
import SwiftUI

/// Platform-agnostic Canvas that draws the wheel segments and labels.
/// Rotation is handled by the parent via .rotationEffect().
struct WheelCanvas: View {
    let entries: [SharedEntry]
    let segments: [WheelMath.Segment]
    var winnerIndex: Int? = nil

    var body: some View {
        Canvas { context, size in
            let r = min(size.width, size.height) / 2.0
            let c = CGPoint(x: size.width / 2, y: size.height / 2)

            guard !entries.isEmpty else {
                context.draw(
                    Text("Add options")
                        .font(.caption)
                        .foregroundStyle(Color.gray),
                    at: c
                )
                return
            }

            for (i, seg) in segments.enumerated() {
                guard i < entries.count else { break }
                let entry = entries[i]
                let sRad = seg.start * .pi / 180
                let eRad = seg.end * .pi / 180
                let mRad = seg.mid * .pi / 180
                let isWinner = winnerIndex == i

                // --- Segment fill ---
                var path = Path()
                path.move(to: c)
                path.addArc(
                    center: c, radius: r,
                    startAngle: .radians(sRad),
                    endAngle: .radians(eRad),
                    clockwise: false
                )
                path.closeSubpath()

                context.fill(path, with: .color(Color(hex: entry.colorHex)))
                context.stroke(
                    path,
                    with: .color(isWinner ? .white : .black.opacity(0.15)),
                    lineWidth: isWinner ? 3 : 1
                )

                // --- Label ---
                let textR = r * 0.32
                let tx = c.x + textR * cos(mRad)
                let ty = c.y + textR * sin(mRad)

                let maxLen = 14
                let label = entry.label.count > maxLen
                    ? String(entry.label.prefix(maxLen - 1)) + "…"
                    : entry.label
                let fontSize = max(9.0, 12.0 - Double(max(0, entry.label.count - 6)) * 0.3)

                var labelCtx = context
                labelCtx.translateBy(x: tx, y: ty)
                labelCtx.rotate(by: .degrees(seg.mid))
                labelCtx.draw(
                    Text(label)
                        .font(.system(size: fontSize, weight: .bold))
                        .foregroundStyle(Color.white),
                    at: .zero,
                    anchor: .leading
                )
            }
        }
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.black, lineWidth: 3))
    }
}
