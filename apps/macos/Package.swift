// swift-tools-version: 6.2
// Package manifest for the Anima macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Anima",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "AnimaIPC", targets: ["AnimaIPC"]),
        .library(name: "AnimaDiscovery", targets: ["AnimaDiscovery"]),
        .executable(name: "Anima", targets: ["Anima"]),
        .executable(name: "anima-mac", targets: ["AnimaMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/AnimaKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "AnimaIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "AnimaDiscovery",
            dependencies: [
                .product(name: "AnimaKit", package: "AnimaKit"),
            ],
            path: "Sources/AnimaDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Anima",
            dependencies: [
                "AnimaIPC",
                "AnimaDiscovery",
                .product(name: "AnimaKit", package: "AnimaKit"),
                .product(name: "AnimaChatUI", package: "AnimaKit"),
                .product(name: "AnimaProtocol", package: "AnimaKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Anima.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "AnimaMacCLI",
            dependencies: [
                "AnimaDiscovery",
                .product(name: "AnimaKit", package: "AnimaKit"),
                .product(name: "AnimaProtocol", package: "AnimaKit"),
            ],
            path: "Sources/AnimaMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "AnimaIPCTests",
            dependencies: [
                "AnimaIPC",
                "Anima",
                "AnimaDiscovery",
                .product(name: "AnimaProtocol", package: "AnimaKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
