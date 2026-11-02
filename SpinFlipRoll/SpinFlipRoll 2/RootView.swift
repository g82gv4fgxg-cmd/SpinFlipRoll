// RootView.swift — iOS target
// One tab per picker. The wheel keeps its own sidebar navigation inside ContentView.
import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            ContentView()
                .tabItem { Label("Wheel", systemImage: "chart.pie.fill") }
            CoinFlipView()
                .tabItem { Label("Coin", systemImage: "centsign.circle.fill") }
            DiceRollView()
                .tabItem { Label("Dice", systemImage: "die.face.5.fill") }
        }
    }
}
