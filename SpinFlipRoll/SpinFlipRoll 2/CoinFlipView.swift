// CoinFlipView.swift — iOS target
// Flip a coin with your own labels for each side.
import SwiftUI
import AudioToolbox

struct CoinFlipView: View {
    @AppStorage("sfr_coin_heads") private var headsLabel = "Heads"
    @AppStorage("sfr_coin_tails") private var tailsLabel = "Tails"
    @AppStorage("sfr_sound") private var soundOn = true

    @State private var angle = 0.0          // degrees around the vertical axis
    @State private var flipping = false
    @State private var result: String? = nil
    @State private var recent: [String] = []

    private var heads: String { headsLabel.trimmingCharacters(in: .whitespaces).isEmpty ? "Heads" : headsLabel }
    private var tails: String { tailsLabel.trimmingCharacters(in: .whitespaces).isEmpty ? "Tails" : tailsLabel }

    /// The back of the coin faces the viewer between 90 and 270 degrees.
    private var showingTails: Bool {
        let turned = angle.truncatingRemainder(dividingBy: 360)
        let positive = turned < 0 ? turned + 360 : turned
        return positive > 90 && positive < 270
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    coin
                        .frame(width: 220, height: 220)
                        .padding(.top, 24)

                    Button {
                        flip()
                    } label: {
                        Text(flipping ? "Flipping…" : "Flip")
                            .font(.headline)
                            .frame(maxWidth: 200)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(flipping)

                    if let result {
                        Text(result)
                            .font(.title2.bold())
                    }

                    labelsSection

                    if !recent.isEmpty {
                        recentSection
                    }
                }
                .padding()
            }
            .navigationTitle("Coin")
        }
    }

    private var coin: some View {
        ZStack {
            Circle()
                .fill(showingTails ? Color(hex: "5B8AC4") : Color(hex: "E8C44A"))
            Circle()
                .stroke(Color.white.opacity(0.5), lineWidth: 6)
                .padding(10)
            Text(showingTails ? tails : heads)
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.4)
                .padding(30)
                // The 3D turn mirrors the back face, so flip the text back.
                .scaleEffect(x: showingTails ? -1 : 1, y: 1)
        }
        .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0))
        .shadow(radius: 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Coin showing \(showingTails ? tails : heads)")
    }

    private var labelsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sides")
                .font(.headline)
            TextField("Heads", text: $headsLabel)
                .textFieldStyle(.roundedBorder)
            TextField("Tails", text: $tailsLabel)
                .textFieldStyle(.roundedBorder)
        }
        .disabled(flipping)
        .padding(.horizontal)
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Recent")
                    .font(.headline)
                Spacer()
                Button("Clear") { recent.removeAll() }
            }
            let headsCount = recent.filter { $0 == heads }.count
            Text("\(heads) \(headsCount) · \(tails) \(recent.count - headsCount)")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(recent.enumerated()), id: \.offset) { item in
                Text(item.element)
            }
        }
        .padding(.horizontal)
    }

    /// Spins the coin with an ease-out, frame by frame, so the face can switch as it turns.
    private func flip() {
        guard !flipping else { return }
        flipping = true
        result = nil

        let landsOnTails = Bool.random()
        let start = angle
        let turned = start.truncatingRemainder(dividingBy: 360)
        let current = turned < 0 ? turned + 360 : turned
        var delta = 360 * 6 + (landsOnTails ? 180.0 : 0.0) - current
        if delta < 360 * 5 { delta += 360 }
        let frames = 96   // about 1.6 seconds at 60 frames a second

        Task {
            for frame in 1...frames {
                let progress = Double(frame) / Double(frames)
                angle = start + delta * (1 - pow(1 - progress, 3))
                try? await Task.sleep(nanoseconds: 16_666_667)
            }
            angle = start + delta
            let label = landsOnTails ? tails : heads
            result = label
            recent.insert(label, at: 0)
            if recent.count > 10 { recent.removeLast() }
            flipping = false
            if soundOn {
                AudioServicesPlaySystemSound(1104)
            }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }
}
