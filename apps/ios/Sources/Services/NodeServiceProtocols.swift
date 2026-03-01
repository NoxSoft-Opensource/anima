import CoreLocation
import Foundation
import AnimaKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: AnimaCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: AnimaCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: AnimaLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: AnimaLocationGetParams,
        desiredAccuracy: AnimaLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
}

protocol DeviceStatusServicing: Sendable {
    func status() async throws -> AnimaDeviceStatusPayload
    func info() -> AnimaDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: AnimaPhotosLatestParams) async throws -> AnimaPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: AnimaContactsSearchParams) async throws -> AnimaContactsSearchPayload
    func add(params: AnimaContactsAddParams) async throws -> AnimaContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: AnimaCalendarEventsParams) async throws -> AnimaCalendarEventsPayload
    func add(params: AnimaCalendarAddParams) async throws -> AnimaCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: AnimaRemindersListParams) async throws -> AnimaRemindersListPayload
    func add(params: AnimaRemindersAddParams) async throws -> AnimaRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: AnimaMotionActivityParams) async throws -> AnimaMotionActivityPayload
    func pedometer(params: AnimaPedometerParams) async throws -> AnimaPedometerPayload
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
