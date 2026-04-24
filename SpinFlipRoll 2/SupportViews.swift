// SupportViews.swift — iOS target
// Small reusable views used across the app.
import SwiftUI

// MARK: - ToggleChip

struct ToggleChip: View {
    let title: String
    @Binding var on: Bool

    init(_ title: String, on: Binding<Bool>) {
        self.title = title
        self._on   = on
    }

    var body: some View {
        Button {
            on.toggle()
        } label: {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(on ? Color.accentColor : Color(.systemGray5))
                .foregroundStyle(on ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - WinnerView

struct WinnerView: View {
    let entry: SharedEntry
    let onKeep: () -> Void
    let onRemove: () -> Void
    let onRemoveAndSpin: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Circle()
                .fill(Color(hex: entry.colorHex))
                .frame(width: 48, height: 48)
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .shadow(radius: 4)

            VStack(spacing: 8) {
                Text("Winner")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(entry.label)
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            VStack(spacing: 12) {
                Button("Keep", action: onKeep)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .frame(maxWidth: 260)

                Button("Remove", action: onRemove)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .frame(maxWidth: 260)

                Button("Remove & Spin Again", action: onRemoveAndSpin)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: 260)
            }

            Spacer()
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - BulkAddView

struct BulkAddView: View {
    @Environment(\.dismiss) private var dismiss
    let list: WheelList

    @State private var text = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("One option per line. Duplicates are skipped.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextEditor(text: $text)
                    .font(.body)
                    .frame(maxHeight: .infinity)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )
            }
            .padding()
            .navigationTitle("Bulk Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { bulkAdd() }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func bulkAdd() {
        let existing = Set(list.entries.map { $0.label.lowercased() })
        let newLabels = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !existing.contains($0.lowercased()) }

        for (i, label) in newLabels.enumerated() {
            let entry = WheelEntry(
                label: label,
                colorHex: list.nextColorHex(),
                order: list.entries.count + i
            )
            list.entries.append(entry)
        }
        dismiss()
    }
}
