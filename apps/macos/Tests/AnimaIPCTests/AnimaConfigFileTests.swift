import Foundation
import Testing
@testable import Anima

@Suite(.serialized)
struct AnimaConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("anima-config-\(UUID().uuidString)")
            .appendingPathComponent("anima.json")
            .path

        await TestIsolation.withEnvValues(["ANIMA_CONFIG_PATH": override]) {
            #expect(AnimaConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("anima-config-\(UUID().uuidString)")
            .appendingPathComponent("anima.json")
            .path

        await TestIsolation.withEnvValues(["ANIMA_CONFIG_PATH": override]) {
            AnimaConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(AnimaConfigFile.remoteGatewayPort() == 19999)
            #expect(AnimaConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(AnimaConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(AnimaConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("anima-config-\(UUID().uuidString)")
            .appendingPathComponent("anima.json")
            .path

        await TestIsolation.withEnvValues(["ANIMA_CONFIG_PATH": override]) {
            AnimaConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            AnimaConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = AnimaConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("anima-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "ANIMA_CONFIG_PATH": nil,
            "ANIMA_STATE_DIR": dir,
        ]) {
            #expect(AnimaConfigFile.stateDirURL().path == dir)
            #expect(AnimaConfigFile.url().path == "\(dir)/anima.json")
        }
    }

    @MainActor
    @Test
    func saveDictAppendsConfigAuditLog() async throws {
        let stateDir = FileManager().temporaryDirectory
            .appendingPathComponent("anima-state-\(UUID().uuidString)", isDirectory: true)
        let configPath = stateDir.appendingPathComponent("anima.json")
        let auditPath = stateDir.appendingPathComponent("logs/config-audit.jsonl")

        defer { try? FileManager().removeItem(at: stateDir) }

        try await TestIsolation.withEnvValues([
            "ANIMA_STATE_DIR": stateDir.path,
            "ANIMA_CONFIG_PATH": configPath.path,
        ]) {
            AnimaConfigFile.saveDict([
                "gateway": ["mode": "local"],
            ])

            let configData = try Data(contentsOf: configPath)
            let configRoot = try JSONSerialization.jsonObject(with: configData) as? [String: Any]
            #expect((configRoot?["meta"] as? [String: Any]) != nil)

            let rawAudit = try String(contentsOf: auditPath, encoding: .utf8)
            let lines = rawAudit
                .split(whereSeparator: \.isNewline)
                .map(String.init)
            #expect(!lines.isEmpty)
            guard let last = lines.last else {
                Issue.record("Missing config audit line")
                return
            }
            let auditRoot = try JSONSerialization.jsonObject(with: Data(last.utf8)) as? [String: Any]
            #expect(auditRoot?["source"] as? String == "macos-anima-config-file")
            #expect(auditRoot?["event"] as? String == "config.write")
            #expect(auditRoot?["result"] as? String == "success")
            #expect(auditRoot?["configPath"] as? String == configPath.path)
        }
    }
}
