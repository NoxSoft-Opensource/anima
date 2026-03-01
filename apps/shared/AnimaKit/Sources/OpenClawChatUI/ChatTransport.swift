import Foundation

public enum AnimaChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(AnimaChatEventPayload)
    case agent(AnimaAgentEventPayload)
    case seqGap
}

public protocol AnimaChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> AnimaChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [AnimaChatAttachmentPayload]) async throws -> AnimaChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> AnimaChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<AnimaChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension AnimaChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "AnimaChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> AnimaChatSessionsListResponse {
        throw NSError(
            domain: "AnimaChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
