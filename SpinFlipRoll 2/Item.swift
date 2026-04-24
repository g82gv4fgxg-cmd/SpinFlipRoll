//
//  Item.swift
//  SpinFlipRoll
//
//  Created by Alexander Holowinski on 9/1/2026.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
