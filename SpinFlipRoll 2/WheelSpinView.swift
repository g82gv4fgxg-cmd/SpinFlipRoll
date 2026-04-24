// WheelSpinView.swift — iOS target
import SwiftUI
import SwiftData
import AudioToolbox

private let kSpinDuration = 4.5

struct WheelSpinView: View {
    @Environment(\.modelContext) private var modelContext
    let list: WheelList

    // Wheel animation state
    @State private var rotationDegrees = 0.0
    @State private var spinning = false
    @State private var winnerIndex: Int? = nil
    @State private var lastWinnerLabel: String? = nil

    // Remove-and-spin-again flow
    @State private var pendingAutoSpin = false

    // Settings (persisted via AppStorage so they survive app restarts)
    @AppStorage("sfr_weighted")  private var weighted      = false
    @AppStorage("sfr_noRepeat")  private var noRepeat      = false
    @AppStorage("sfr_eliminate") private var eliminateMode = false
    @AppStorage("sfr_sound")     private var soundOn       = true

    // Sheet / overlay visibility
    @State private var showWinner       = false
    @State private var showEntries      = false
    @State private var showHistory      = false
    @State private var showBulkAdd      = false

    // Quick-add input
    @State private var quickLabel       = ""
    @State private var duplicateWarning = false

    // MARK: - Derived

    var entries: [SharedEntry] {
        list.sortedEntries.map { SharedEntry(label: $0.label, colorHex: $0.colorHex, weight: $0.weight) }
    }

    var segments: [WheelMath.Segment] {
        WheelMath.buildSegments(entries, weighted: weighted)
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                settingsBar

                // Wheel + pointer
                ZStack(alignment: .top) {
                    Text("▼")
                        .font(.title2)
                        .zIndex(1)

                    WheelCanvas(
                        entries: entries,
                        segments: segments,
                        winnerIndex: spinning ? nil : winnerIndex
                    )
                    .frame(width: 300, height: 300)
                    .rotationEffect(.degrees(rotationDegrees))
                    .padding(.top, 24)
                }

                Button {
                    spin()
                } label: {
                    Text(spinning ? "Spinning…" : "Spin")
                        .font(.headline)
                        .frame(maxWidth: 200)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(spinning || entries.count < 2)

                if eliminateMode && !entries.isEmpty {
                    Text("\(entries.count) option\(entries.count == 1 ? "" : "s") remaining")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                quickAddBar
            }
            .padding()
        }
        .navigationTitle(list.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("History", systemImage: "clock") { showHistory = true }
                Button("Entries", systemImage: "list.bullet") { showEntries = true }
            }
        }
        // Sheets
        .sheet(isPresented: $showEntries)  { ManageEntriesView(list: list) }
        .sheet(isPresented: $showHistory)  { HistoryView(list: list) }
        .sheet(isPresented: $showBulkAdd)  { BulkAddView(list: list) }
        .sheet(isPresented: $showWinner, onDismiss: { winnerIndex = nil }) {
            if let idx = winnerIndex, idx < entries.count {
                WinnerView(
                    entry: entries[idx],
                    onKeep: {
                        showWinner = false
                    },
                    onRemove: {
                        removeEntry(at: idx)
                        showWinner = false
                    },
                    onRemoveAndSpin: {
                        removeEntry(at: idx)
                        showWinner = false
                        pendingAutoSpin = true
                    }
                )
            }
        }
        // Auto-spin after Remove & Spin Again
        .onChange(of: pendingAutoSpin) { _, pending in
            guard pending, !spinning, winnerIndex == nil, entries.count >= 2 else { return }
            pendingAutoSpin = false
            spin()
        }
        // Re-sync connectivity when list changes
        .onChange(of: list.entries.count) { _, _ in
            PhoneConnectivityManager.shared.syncLists()
        }
    }

    // MARK: - Settings bar

    private var settingsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ToggleChip("Weighted", on: $weighted)
                ToggleChip("Eliminate", on: $eliminateMode)
                    .help("Auto-remove winner after each spin")
                ToggleChip("No repeat", on: $noRepeat)
                    .help("Never land on the same option twice in a row")
                Button {
                    soundOn.toggle()
                } label: {
                    Image(systemName: soundOn ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .frame(width: 36, height: 28)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Quick-add bar

    private var quickAddBar: some View {
        HStack {
            TextField("Add option…", text: $quickLabel)
                .textFieldStyle(.roundedBorder)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(duplicateWarning ? Color.red : Color.clear, lineWidth: 1.5)
                )
                .onSubmit { quickAdd() }
                .disabled(spinning)

            Button("Add")  { quickAdd() }
                .disabled(spinning || quickLabel.trimmingCharacters(in: .whitespaces).isEmpty)

            Button("Bulk") { showBulkAdd = true }
                .disabled(spinning)
        }
        .padding(.horizontal)
    }

    // MARK: - Actions

    private func quickAdd() {
        let label = quickLabel.trimmingCharacters(in: .whitespaces)
        guard !label.isEmpty else { return }

        if list.entries.contains(where: { $0.label.lowercased() == label.lowercased() }) {
            duplicateWarning = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { duplicateWarning = false }
            return
        }

        let entry = WheelEntry(
            label: label,
            colorHex: list.nextColorHex(),
            order: list.entries.count
        )
        list.entries.append(entry)
        quickLabel = ""
    }

    private func removeEntry(at idx: Int) {
        let sorted = list.sortedEntries
        guard idx < sorted.count else { return }
        modelContext.delete(sorted[idx])
        // Reindex
        for (i, e) in list.sortedEntries.enumerated() { e.order = i }
    }

    private func spin() {
        guard !spinning, entries.count >= 2 else { return }

        let chosen = WheelMath.pickWinner(
            entries, weighted: weighted,
            excluding: noRepeat ? lastWinnerLabel : nil
        )
        let delta = WheelMath.spinDelta(
            winnerMid: segments[chosen].mid,
            currentRotation: rotationDegrees
        )

        spinning   = true
        winnerIndex = nil

        withAnimation(.timingCurve(0.08, 0.85, 0.22, 1.0, duration: kSpinDuration)) {
            rotationDegrees += delta
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + kSpinDuration) {
            guard chosen < self.entries.count else { self.spinning = false; return }
            let winner = self.entries[chosen]

            self.winnerIndex      = chosen
            self.lastWinnerLabel  = winner.label
            self.spinning         = false

            // Persist result
            let result = SpinResult(label: winner.label, listName: self.list.name)
            self.modelContext.insert(result)

            // Feedback
            if self.soundOn {
                AudioServicesPlaySystemSound(1016) // built-in "tweet" — works offline
            }
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

            if self.eliminateMode {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    self.removeEntry(at: chosen)
                    self.winnerIndex = nil
                }
            } else {
                self.showWinner = true
            }
        }
    }
}
