// ContentView.swift — iOS target
import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WheelList.createdAt) private var lists: [WheelList]
    @State private var selectedList: WheelList?
    @State private var newListName = ""
    @State private var showingNewList = false

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedList) {
                ForEach(lists) { list in
                    NavigationLink(value: list) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(list.name)
                                .font(.headline)
                            Text("\(list.entries.count) option\(list.entries.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete(perform: deleteLists)
            }
            .navigationTitle("My Wheels")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    EditButton()
                }
                ToolbarItem(placement: .bottomBar) {
                    Button {
                        showingNewList = true
                    } label: {
                        Label("New Wheel", systemImage: "plus.circle.fill")
                    }
                }
            }
            .alert("New Wheel", isPresented: $showingNewList) {
                TextField("Name", text: $newListName)
                Button("Create") { createList() }
                Button("Cancel", role: .cancel) { newListName = "" }
            }
            .onAppear {
                // Auto-create a default list on first launch
                if lists.isEmpty { createDefaultList() }
            }
        } detail: {
            if let list = selectedList {
                WheelSpinView(list: list)
            } else {
                ContentUnavailableView(
                    "No Wheel Selected",
                    systemImage: "circle.dashed",
                    description: Text("Pick a wheel from the sidebar or create a new one.")
                )
            }
        }
    }

    private func createList() {
        let name = newListName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { newListName = ""; return }
        let list = WheelList(name: name)
        modelContext.insert(list)
        newListName = ""
        selectedList = list
    }

    private func createDefaultList() {
        let list = WheelList(name: "My Wheel")
        modelContext.insert(list)
        selectedList = list
    }

    private func deleteLists(_ offsets: IndexSet) {
        for i in offsets {
            if selectedList == lists[i] { selectedList = nil }
            modelContext.delete(lists[i])
        }
    }
}
