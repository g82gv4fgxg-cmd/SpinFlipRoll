// HistoryView.swift — iOS target
import SwiftUI
import SwiftData

struct HistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let list: WheelList

    @Query(sort: \SpinResult.timestamp, order: .reverse)
    private var allResults: [SpinResult]

    private var results: [SpinResult] {
        allResults.filter { $0.listName == list.name }
    }

    var body: some View {
        NavigationStack {
            Group {
                if results.isEmpty {
                    ContentUnavailableView(
                        "No spins yet",
                        systemImage: "clock",
                        description: Text("Results will appear here after you spin.")
                    )
                } else {
                    List {
                        ForEach(results) { result in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(result.label)
                                        .font(.headline)
                                    Text(result.timestamp, style: .relative)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(result.timestamp, format: .dateTime.hour().minute())
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .onDelete(perform: deleteResults)
                    }
                }
            }
            .navigationTitle("Spin History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                if !results.isEmpty {
                    ToolbarItem(placement: .destructiveAction) {
                        Button("Clear", role: .destructive) { clearAll() }
                    }
                }
            }
        }
    }

    private func deleteResults(_ offsets: IndexSet) {
        for i in offsets { modelContext.delete(results[i]) }
    }

    private func clearAll() {
        results.forEach { modelContext.delete($0) }
    }
}
