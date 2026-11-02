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
                    // Shares the same JSON as Export, which the recipient can paste into Import.
                    ShareLink(item: exportJSON(), subject: Text(list.name)) {
                        Text("Share")
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
        }
    }

    // MARK: - Actions

    private func deleteEntries(_ offsets: IndexSet) {
        let sorted = list.sortedEntries
        let removed = offsets.map { sorted[$0] }
        // Take the entries out of the list before deleting them so the list updates straight away.
        list.entries.removeAll { entry in removed.contains { $0 === entry } }
        removed.forEach { modelContext.delete($0) }
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

        // Updated as we go so a label repeated within the pasted JSON is only added once.
        var existing = Set(list.entries.map { $0.label.lowercased() })
        for item in parsed {
            let label = (item["label"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            guard !label.isEmpty, existing.insert(label.lowercased()).inserted else { continue }
            let entry = WheelEntry(
                label: label,
                // "colorHex" is what the web app exports.
                colorHex: item["color"] as? String ?? item["colorHex"] as? String ?? list.nextColorHex(),
                weight: item["weight"] as? Double ?? 1.0,
                order: list.entries.count
            )
            list.entries.append(entry)
        }
        showImportExport = false
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
