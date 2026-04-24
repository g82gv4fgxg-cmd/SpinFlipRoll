// ManageEntriesView.swift — iOS target
import SwiftUI
import SwiftData

struct ManageEntriesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let list: WheelList

    @State private var importExportText = ""
    @State private var showImportExport = false
    @State private var importExportMode: ImportExportMode = .export
    @State private var shareURL: URL? = nil

    enum ImportExportMode { case `import`, export }

    var body: some View {
        NavigationStack {
            List {
                ForEach(list.sortedEntries) { entry in
                    EntryRow(entry: entry, list: list)
                }
                .onDelete(perform: deleteEntries)
                .onMove(perform: moveEntries)
            }
            .navigationTitle("Entries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    EditButton()
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Import") {
                        importExportMode = .import
                        importExportText = ""
                        showImportExport = true
                    }
                    Spacer()
                    Button("Export") {
                        importExportMode = .export
                        importExportText = exportJSON()
                        showImportExport = true
                    }
                    .disabled(list.entries.isEmpty)
                    Spacer()
                    Button("Share") {
                        shareWheel()
                    }
                    .disabled(list.entries.isEmpty)
                }
            }
            .sheet(isPresented: $showImportExport) {
                ImportExportSheet(
                    mode: importExportMode,
                    text: $importExportText,
                    onImport: { importJSON() }
                )
            }
            .sheet(item: $shareURL) { url in
                ShareSheet(url: url)
            }
        }
    }

    // MARK: - Actions

    private func deleteEntries(_ offsets: IndexSet) {
        let sorted = list.sortedEntries
        for i in offsets { modelContext.delete(sorted[i]) }
        reindex()
    }

    private func moveEntries(_ source: IndexSet, _ dest: Int) {
        var sorted = list.sortedEntries
        sorted.move(fromOffsets: source, toOffset: dest)
        for (i, e) in sorted.enumerated() { e.order = i }
    }

    private func reindex() {
        for (i, e) in list.sortedEntries.enumerated() { e.order = i }
    }

    private func exportJSON() -> String {
        let data = list.sortedEntries.map { ["label": $0.label, "weight": $0.weight, "color": $0.colorHex] }
        let json = try? JSONSerialization.data(withJSONObject: data, options: .prettyPrinted)
        return json.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    private func importJSON() {
        guard let data = importExportText.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return }

        let existing = Set(list.entries.map { $0.label.lowercased() })
        for (i, item) in parsed.enumerated() {
            let label = (item["label"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            guard !label.isEmpty, !existing.contains(label.lowercased()) else { continue }
            let entry = WheelEntry(
                label: label,
                colorHex: item["color"] as? String ?? list.nextColorHex(),
                weight: item["weight"] as? Double ?? 1.0,
                order: list.entries.count + i
            )
            list.entries.append(entry)
        }
        showImportExport = false
    }

    private func shareWheel() {
        let data = list.sortedEntries.map { ["label": $0.label, "weight": $0.weight] as [String: Any] }
        guard let json = try? JSONSerialization.data(withJSONObject: data),
              let encoded = String(data: json, encoding: .utf8)
                  .flatMap({ $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }),
              let url = URL(string: "spinfliproll://share?data=\(encoded)")
        else { return }
        shareURL = url
    }
}

// MARK: - EntryRow

private struct EntryRow: View {
    let entry: WheelEntry
    let list: WheelList

    var body: some View {
        HStack(spacing: 12) {
            ColorPicker("", selection: Binding(
                get: { Color(hex: entry.colorHex) },
                set: { entry.colorHex = uiColorHex($0) }
            ))
            .labelsHidden()
            .frame(width: 28, height: 28)

            TextField("Label", text: Binding(
                get: { entry.label },
                set: { entry.label = $0 }
            ))

            Spacer()

            TextField("wt", value: Binding(
                get: { entry.weight },
                set: { entry.weight = max(0, $0) }
            ), format: .number)
            .frame(width: 44)
            .multilineTextAlignment(.trailing)
            .keyboardType(.decimalPad)
            .foregroundStyle(.secondary)
            .font(.caption)
        }
    }

    private func uiColorHex(_ color: Color) -> String {
        let resolved = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}

// MARK: - ImportExportSheet

private struct ImportExportSheet: View {
    @Environment(\.dismiss) private var dismiss
    let mode: ManageEntriesView.ImportExportMode
    @Binding var text: String
    let onImport: () -> Void

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.system(.caption, design: .monospaced))
                .padding()
                .navigationTitle(mode == .export ? "Exported JSON" : "Paste JSON to Import")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                    if mode == .import {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Import") { onImport() }
                        }
                    } else {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Copy") {
                                UIPasteboard.general.string = text
                                dismiss()
                            }
                        }
                    }
                }
        }
    }
}

// MARK: - ShareSheet

private struct ShareSheet: View, Identifiable {
    var id: String { url.absoluteString }
    let url: URL

    var body: some View {
        ShareLink(item: url) {
            Label("Share Wheel Link", systemImage: "square.and.arrow.up")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .presentationDetents([.height(120)])
    }
}
