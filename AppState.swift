// AppState.swift — iOS target only
// All persistence via UserDefaults + JSON. No SwiftData required.
import Foundation

final class AppState: ObservableObject {
    static let shared = AppState()

    @Published var lists: [SharedWheelList] = []
    @Published var history: [SharedSpinResult] = []

    private let listsKey   = "sfr_lists"
    private let historyKey = "sfr_history"

    init() {
        lists = decode([SharedWheelList].self, forKey: listsKey) ?? []
        if lists.isEmpty {
            lists = [SharedWheelList(name: "My Wheel")]
        }
        history = decode([SharedSpinResult].self, forKey: historyKey) ?? []
    }

    // MARK: - List helpers

    func addList(name: String) {
        lists.append(SharedWheelList(name: name.isEmpty ? "New Wheel" : name))
        save()
    }

    func deleteList(at offsets: IndexSet) {
        lists.remove(atOffsets: offsets)
        save()
    }

    func addEntry(_ entry: SharedEntry, toListId id: UUID) {
        guard let i = idx(id) else { return }
        lists[i].entries.append(entry)
        save()
    }

    func removeEntry(entryId: UUID, fromListId listId: UUID) {
        guard let i = idx(listId) else { return }
        lists[i].entries.removeAll { $0.id == entryId }
        save()
    }

    func updateEntry(_ entry: SharedEntry, inListId listId: UUID) {
        guard let i = idx(listId),
              let j = lists[i].entries.firstIndex(where: { $0.id == entry.id }) else { return }
        lists[i].entries[j] = entry
        save()
    }

    func moveEntries(inListId listId: UUID, from source: IndexSet, to dest: Int) {
        guard let i = idx(listId) else { return }
        lists[i].entries.move(fromOffsets: source, toOffset: dest)
        save()
    }

    func bulkAdd(labels: [String], toListId listId: UUID) {
        guard let i = idx(listId) else { return }
        let existing = Set(lists[i].entries.map { $0.label.lowercased() })
        let newEntries = labels
            .filter { !$0.isEmpty && !existing.contains($0.lowercased()) }
            .map { SharedEntry(label: $0, colorHex: lists[i].nextColorHex()) }
        lists[i].entries.append(contentsOf: newEntries)
        save()
    }

    // MARK: - History

    func addResult(_ result: SharedSpinResult) {
        history.insert(result, at: 0)
        if history.count > 50 { history = Array(history.prefix(50)) }
        save()
    }

    func clearHistory(forListName name: String) {
        history.removeAll { $0.listName == name }
        save()
    }

    // MARK: - Persistence

    func save() {
        encode(lists,   forKey: listsKey)
        encode(history, forKey: historyKey)
        PhoneConnectivityManager.shared.syncLists(lists)
    }

    // MARK: - Private

    private func idx(_ id: UUID) -> Int? {
        lists.firstIndex(where: { $0.id == id })
    }

    private func decode<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func encode<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
