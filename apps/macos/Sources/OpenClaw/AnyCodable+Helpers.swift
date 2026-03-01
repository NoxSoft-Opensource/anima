import Foundation
import AnimaKit
import AnimaProtocol

// Prefer the AnimaKit wrapper to keep gateway request payloads consistent.
typealias AnyCodable = AnimaKit.AnyCodable
typealias InstanceIdentity = AnimaKit.InstanceIdentity

extension AnyCodable {
    var stringValue: String? {
        self.value as? String
    }

    var boolValue: Bool? {
        self.value as? Bool
    }

    var intValue: Int? {
        self.value as? Int
    }

    var doubleValue: Double? {
        self.value as? Double
    }

    var dictionaryValue: [String: AnyCodable]? {
        self.value as? [String: AnyCodable]
    }

    var arrayValue: [AnyCodable]? {
        self.value as? [AnyCodable]
    }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}

extension AnimaProtocol.AnyCodable {
    var stringValue: String? {
        self.value as? String
    }

    var boolValue: Bool? {
        self.value as? Bool
    }

    var intValue: Int? {
        self.value as? Int
    }

    var doubleValue: Double? {
        self.value as? Double
    }

    var dictionaryValue: [String: AnimaProtocol.AnyCodable]? {
        self.value as? [String: AnimaProtocol.AnyCodable]
    }

    var arrayValue: [AnimaProtocol.AnyCodable]? {
        self.value as? [AnimaProtocol.AnyCodable]
    }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: AnimaProtocol.AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [AnimaProtocol.AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}
