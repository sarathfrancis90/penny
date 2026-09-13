@preconcurrency import BackgroundTasks
import Foundation
import Observation

struct AutomaticBackupSettings: Codable, Equatable {
    var enabled = false
    var retryCount = 0
    var nextEligibleAt: Date?
    var pauseReason: String?
}

@MainActor protocol BackgroundBackupTask: AnyObject {
    var expiration: (() -> Void)? { get set }
    func complete(success: Bool)
}
@MainActor protocol BackupScheduling: AnyObject {
    func register(_ handler: @escaping @MainActor (any BackgroundBackupTask) -> Void) -> Bool
    func schedule(at date: Date) throws
    func cancel()
}
@MainActor private final class SystemBackupTask: BackgroundBackupTask {
    let task: BGTask
    var expiration: (() -> Void)?
    private var completed = false
    init(_ task: BGTask) {
        self.task = task
        task.expirationHandler = { [weak self] in Task { @MainActor in self?.expiration?() } }
    }
    func complete(success: Bool) {
        guard !completed else { return }; completed = true; expiration = nil
        task.expirationHandler = nil; task.setTaskCompleted(success: success)
    }
}
@MainActor final class SystemBackupScheduler: BackupScheduling {
    static let identifier = "ca.penny.offline.backup.processing"
    private static var registered = false
    func register(_ handler: @escaping @MainActor (any BackgroundBackupTask) -> Void) -> Bool {
        guard !Self.registered else { return false }
        let accepted = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.identifier, using: .main) { task in
            MainActor.assumeIsolated { handler(SystemBackupTask(task)) }
        }
        Self.registered = accepted; return accepted
    }
    func schedule(at date: Date) throws {
        let request = BGProcessingTaskRequest(identifier: Self.identifier)
        request.requiresNetworkConnectivity = true; request.requiresExternalPower = false
        request.earliestBeginDate = date
        try BGTaskScheduler.shared.submit(request)
    }
    func cancel() { BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.identifier) }
}

/// One app-owned coordinator serializes all foreground and background operations.
@MainActor @Observable final class BackupCoordinator {
    let cloud: CloudPublication
    private let scheduler: any BackupScheduling
    private let now: () -> Date
    private var registered = false
    private var work: Task<Void, Never>?
    private var activeId: UUID?
    private var background: (any BackgroundBackupTask)?
    private(set) var scheduledAt: Date?
    private(set) var schedulingError: String?
    init(cloud: CloudPublication, scheduler: any BackupScheduling = SystemBackupScheduler(), now: @escaping () -> Date = Date.init) {
        self.cloud = cloud; self.scheduler = scheduler; self.now = now
        registered = scheduler.register { [weak self] task in
            guard let self else { task.complete(success: false); return }; self.runBackground(task)
        }
    }
    var automaticEnabled: Bool { cloud.automaticSettings.enabled }
    var canEnableAutomatic: Bool { registered && cloud.available && cloud.enabled && cloud.hasConfirmedKey && cloud.vault.isReady }
    var isRunning: Bool { activeId != nil }
    func setAutomatic(_ enabled: Bool) {
        if !enabled { cancelActive(); update(AutomaticBackupSettings()); return }
        guard canEnableAutomatic else { schedulingError = "Enable iCloud backup with your confirmed key first. Automatic backup is unavailable until then."; return }
        schedulingError = nil
        guard update(AutomaticBackupSettings(enabled: true, nextEligibleAt: now().addingTimeInterval(900)), explicitEnable: true) else { return }
        reconcile()
    }
    @discardableResult private func update(_ settings: AutomaticBackupSettings, explicitEnable: Bool = false) -> Bool {
        do { try cloud.setAutomaticSettings(settings, explicitEnable: explicitEnable); return true }
        catch {
            scheduler.cancel(); scheduledAt = nil
            schedulingError = "Automatic backup paused because its settings could not be saved. Earlier backups are unchanged. Resolve storage access, then enable it again."
            return false
        }
    }
    func reconcile() {
        cloud.localVaultChanged()
        guard automaticEnabled else { if background != nil { cancelActive() }; scheduler.cancel(); scheduledAt = nil; return }
        guard canEnableAutomatic else { cancelActive(); pause("Automatic backup is paused. Unlock this device and check your recovery key and iCloud account, then enable it again."); return }
        guard !isRunning, !cloud.isBusy else { return }
        guard cloud.pendingChanges else { scheduler.cancel(); scheduledAt = nil; return }
        let date = max(now().addingTimeInterval(900), cloud.automaticSettings.nextEligibleAt ?? now().addingTimeInterval(900))
        // New edits coalesce into the existing request instead of delaying it.
        if let scheduledAt, scheduledAt <= date { return }
        do { try scheduler.schedule(at: date); scheduledAt = date; schedulingError = nil }
        catch { schedulingError = "iOS could not schedule automatic backup. Local changes remain pending. Open Penny and retry." }
    }
    func runForeground(_ operation: @escaping @MainActor () async -> Void) {
        guard !isRunning, !cloud.isBusy else { return }
        let id = UUID(); activeId = id
        let previous = cloud.lastGood?.manifestId
        work = Task {
            await operation()
            guard activeId == id else { return }
            activeId = nil; work = nil
            if cloud.lastGood?.manifestId != nil && cloud.lastGood?.manifestId != previous { succeeded() }
            reconcile()
        }
    }
    func cancelForeground() { if background == nil { cancelActive(); reconcile() } }
    func cancelByUser() { cancelActive(); pause("Automatic backup is paused after cancellation. Enable it again when ready.") }
    func disableCloud() { cancelActive(); cloud.disable(); reconcile() }
    private func cancelActive() {
        activeId = nil; work?.cancel(); work = nil; cloud.cancel()
        background?.expiration = nil; background?.complete(success: false); background = nil
        scheduler.cancel(); scheduledAt = nil
    }
    private func pause(_ reason: String) {
        scheduler.cancel(); scheduledAt = nil
        update(AutomaticBackupSettings(pauseReason: reason)); schedulingError = reason
    }
    @discardableResult private func succeeded() -> Bool {
        guard automaticEnabled else { return true }
        return update(AutomaticBackupSettings(enabled: true, nextEligibleAt: now().addingTimeInterval(86_400)))
    }
    private func runBackground(_ task: any BackgroundBackupTask) {
        task.expiration = { [weak self, weak task] in
            guard let self else { task?.complete(success: false); return }
            guard self.background === task else { return }
            self.cancelActive(); self.pause("iOS ended this backup before it finished. Earlier backups are unchanged. Enable automatic backup again or back up now.")
        }
        scheduledAt = nil
        guard !isRunning, !cloud.isBusy else { task.expiration = nil; task.complete(success: false); return }
        guard automaticEnabled, canEnableAutomatic else { task.expiration = nil; task.complete(success: false); reconcile(); return }
        guard cloud.pendingChanges else { task.expiration = nil; task.complete(success: true); scheduler.cancel(); return }
        if let eligible = cloud.automaticSettings.nextEligibleAt, eligible > now() { task.expiration = nil; reconcile(); task.complete(success: false); return }
        let id = UUID(); activeId = id; background = task
        work = Task {
            await cloud.publish()
            guard activeId == id else { return }
            activeId = nil; work = nil; background = nil; task.expiration = nil
            var success = cloud.error == nil && cloud.lastGood != nil
            if success { success = succeeded() }
            else if cloud.lastFailure == .transient && automaticEnabled && cloud.automaticSettings.retryCount < 2 {
                var settings = cloud.automaticSettings; settings.retryCount += 1
                settings.nextEligibleAt = now().addingTimeInterval(settings.retryCount == 1 ? 3_600 : 7_200)
                guard update(settings) else { task.complete(success: false); return }
            } else { pause(cloud.error ?? "Automatic backup paused. Open Penny to review the backup state.") }
            reconcile(); task.complete(success: success)
        }
    }
}
