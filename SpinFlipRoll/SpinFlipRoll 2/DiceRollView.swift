// DiceRollView.swift — iOS target
// Roll 1 to 6 dice with 4 to 20 sides. Tap a die to hold it between rolls.
import SwiftUI
import AudioToolbox

struct DiceRollView: View {
    @AppStorage("sfr_dice_count") private var diceCount = 2
    @AppStorage("sfr_dice_sides") private var sides = 6
    @AppStorage("sfr_sound") private var soundOn = true

    @State private var values: [Int] = []
    @State private var held: Set<Int> = []
    @State private var rolling = false
    @State private var recent: [String] = []

    private let sideOptions = [4, 6, 8, 10, 12, 20]

    // Guard against odd stored values so a roll can never use an invalid range.
    private var count: Int { min(max(diceCount, 1), 6) }
    private var faces: Int { sideOptions.contains(sides) ? sides : 6 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    diceGrid
                        .padding(.top, 24)

                    Button {
                        roll()
                    } label: {
                        Text(rolling ? "Rolling…" : held.isEmpty ? "Roll" : "Roll the rest")
                            .font(.headline)
                            .frame(maxWidth: 200)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(rolling || held.count >= count)

                    if values.count == count && !rolling {
                        Text(count > 1 ? "Total \(values.reduce(0, +))" : "Rolled \(values.first ?? 0)")
                            .font(.title2.bold())
                    }

                    settingsSection

                    if !recent.isEmpty {
                        recentSection
                    }
                }
                .padding()
            }
            .navigationTitle("Dice")
            .onChange(of: diceCount) { _, _ in resetDice() }
            .onChange(of: sides) { _, _ in resetDice() }
        }
    }

    private var diceGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 16)], spacing: 16) {
            ForEach(0..<count, id: \.self) { index in
                dieView(index: index)
            }
        }
    }

    private func dieView(index: Int) -> some View {
        let value: Int? = index < values.count ? values[index] : nil
        let isHeld = held.contains(index)

        return Button {
            toggleHeld(index)
        } label: {
            VStack(spacing: 6) {
                Group {
                    if faces == 6, let value, (1...6).contains(value) {
                        Image(systemName: "die.face.\(value).fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(isHeld ? Color.orange : Color.primary)
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16)
                                .fill(isHeld ? Color.orange : Color(hex: "5B8AC4"))
                            Text(value.map { String($0) } ?? "?")
                                .font(.system(size: 34, weight: .heavy))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .frame(width: 84, height: 84)
                .rotationEffect(.degrees(rolling && !isHeld ? Double.random(in: -12...12) : 0))

                Text(isHeld ? "Held" : "d\(faces)")
                    .font(.caption.bold())
                    .foregroundStyle(isHeld ? Color.orange : Color.secondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(rolling || value == nil)
        .accessibilityLabel("Die \(index + 1): \(value.map { String($0) } ?? "not rolled yet")\(isHeld ? ", held" : "")")
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Stepper("Dice: \(count)", value: $diceCount, in: 1...6)
            Picker("Sides", selection: $sides) {
                ForEach(sideOptions, id: \.self) { option in
                    Text("d\(option)").tag(option)
                }
            }
            .pickerStyle(.segmented)
            if !held.isEmpty {
                Button("Release held dice") { held.removeAll() }
            }
            Text("Tap a die to hold it between rolls.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .disabled(rolling)
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
            ForEach(Array(recent.enumerated()), id: \.offset) { item in
                Text(item.element)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal)
    }

    private func toggleHeld(_ index: Int) {
        guard !rolling, index < values.count else { return }
        if held.contains(index) {
            held.remove(index)
        } else {
            held.insert(index)
        }
    }

    private func resetDice() {
        values = []
        held = []
    }

    private func roll() {
        guard !rolling, held.count < count else { return }
        rolling = true
        let diceTotal = count
        let range = 1...faces
        let rolled = (0..<diceTotal).map { index in
            held.contains(index) && index < values.count ? values[index] : Int.random(in: range)
        }

        Task {
            // Flicker random faces, slowing down, before settling on the result.
            for step in 0..<10 {
                values = (0..<diceTotal).map { index in
                    held.contains(index) ? rolled[index] : Int.random(in: range)
                }
                try? await Task.sleep(nanoseconds: UInt64(50_000_000 + step * 12_000_000))
            }
            values = rolled
            rolling = false
            let total = rolled.reduce(0, +)
            let summary = diceTotal > 1 ? "\(rolled.map { String($0) }.joined(separator: " + ")) = \(total)" : "\(total)"
            recent.insert("\(summary)  (\(diceTotal)d\(range.upperBound))", at: 0)
            if recent.count > 10 { recent.removeLast() }
            if soundOn {
                AudioServicesPlaySystemSound(1104)
            }
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        }
    }
}
