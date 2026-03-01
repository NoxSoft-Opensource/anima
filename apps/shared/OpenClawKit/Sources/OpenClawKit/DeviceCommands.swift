import Foundation

public enum AnimaDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum AnimaBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum AnimaThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum AnimaNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum AnimaNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct AnimaBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: AnimaBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: AnimaBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct AnimaThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: AnimaThermalState

    public init(state: AnimaThermalState) {
        self.state = state
    }
}

public struct AnimaStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct AnimaNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: AnimaNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [AnimaNetworkInterfaceType]

    public init(
        status: AnimaNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [AnimaNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct AnimaDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: AnimaBatteryStatusPayload
    public var thermal: AnimaThermalStatusPayload
    public var storage: AnimaStorageStatusPayload
    public var network: AnimaNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: AnimaBatteryStatusPayload,
        thermal: AnimaThermalStatusPayload,
        storage: AnimaStorageStatusPayload,
        network: AnimaNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct AnimaDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
