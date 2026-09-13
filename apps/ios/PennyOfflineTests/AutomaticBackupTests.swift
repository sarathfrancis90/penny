import CryptoKit
import XCTest
@testable import PennyOffline

@MainActor private final class FakeBackgroundTask: BackgroundBackupTask {
    var expiration: (() -> Void)?
    var completions: [Bool] = []
    func complete(success: Bool) { completions.append(success) }
}
@MainActor private final class FakeBackupScheduler: BackupScheduling {
    var handler: (@MainActor (any BackgroundBackupTask) -> Void)?
    var requests: [Date] = []
    var cancellations = 0
    var fails = false
    func register(_ handler: @escaping @MainActor (any BackgroundBackupTask) -> Void) -> Bool { self.handler = handler; return true }
    func schedule(at date: Date) throws { if fails { throw CloudFailure.transient }; requests.append(date) }
    func cancel() { cancellations += 1 }
    func fire(_ task: FakeBackgroundTask) { handler?(task) }
}
@MainActor final class AutomaticBackupTests: XCTestCase {
    private let key = "pny1-1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100"
    private func directory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
    private func settle(_ coordinator: BackupCoordinator) async {
        for _ in 0..<2_000 { if !coordinator.isRunning { return }; await Task.yield() }
        XCTFail("Coordinator failed to finish bounded fake-provider operation")
    }
    func testDefaultsConstraintsDedupePersistenceAndUnchangedVaultSkip() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let deviceKey = SymmetricKey(size: .bits256), provider = FakeCloud(), scheduler = FakeBackupScheduler()
        let vault = VaultStore(directory: dir, key: deviceKey), key = key
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
        var clock = Date(); let coordinator = BackupCoordinator(cloud: cloud, scheduler: scheduler, now: { clock })
        coordinator.reconcile(); XCTAssertFalse(coordinator.automaticEnabled); XCTAssertTrue(scheduler.requests.isEmpty)
        coordinator.setAutomatic(true); XCTAssertFalse(coordinator.automaticEnabled)
        await cloud.enable(); coordinator.setAutomatic(true)
        XCTAssertTrue(coordinator.automaticEnabled); XCTAssertEqual(scheduler.requests, [clock.addingTimeInterval(900)])
        clock = clock.addingTimeInterval(60); coordinator.reconcile(); XCTAssertEqual(scheduler.requests.count, 1)
        let reopened = CloudPublication(vault: VaultStore(directory: dir, key: deviceKey), provider: provider, keyReader: { key })
        XCTAssertTrue(reopened.automaticSettings.enabled)
        clock = clock.addingTimeInterval(901); let task = FakeBackgroundTask(); scheduler.fire(task); await settle(coordinator)
        XCTAssertEqual(task.completions, [true]); XCTAssertFalse(cloud.pendingChanges); XCTAssertNil(coordinator.scheduledAt)
        let count = provider.objects.count; let unchanged = FakeBackgroundTask(); scheduler.fire(unchanged)
        XCTAssertEqual(unchanged.completions, [true]); XCTAssertEqual(provider.objects.count, count)
        try vault.save(Expense(merchant: "Pending", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other))
        coordinator.reconcile(); XCTAssertEqual(scheduler.requests.last, clock.addingTimeInterval(86_400))
        coordinator.setAutomatic(false); XCTAssertFalse(coordinator.automaticEnabled); XCTAssertNil(coordinator.scheduledAt)
        XCTAssertFalse(CloudPublication(vault: VaultStore(directory: dir, key: deviceKey), provider: provider, keyReader: { key }).automaticSettings.enabled)
    }
    func testExpiryDisableCancelAndLateCallbackCompleteOncePreservingLastGood() async throws {
        for action in ["expiry", "disable", "cancel", "restore"] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), scheduler = FakeBackupScheduler(), key = key
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
            var clock = Date(); let coordinator = BackupCoordinator(cloud: cloud, scheduler: scheduler, now: { clock })
            await cloud.enable(); await cloud.publish(); let last = try XCTUnwrap(cloud.lastGood), old = provider.objects
            try vault.save(Expense(merchant: "Pending", amountMinor: 100, expenseDate: "2026-01-01", category: Categories.other))
            coordinator.setAutomatic(true); clock = clock.addingTimeInterval(901)
            let task = FakeBackgroundTask()
            provider.hook = { phase in
                if phase == "snapshotUpload" {
                    let lateExpiry = task.expiration
                    if action == "expiry" { task.expiration?() }
                    else if action == "disable" { coordinator.disableCloud() }
                    else if action == "cancel" { coordinator.cancelByUser() }
                    else { try! vault.restore(vault.snapshot); coordinator.reconcile() }
                    lateExpiry?()
                }
            }
            scheduler.fire(task); await settle(coordinator)
            for _ in 0..<30 { await Task.yield() } // Allow the cancelled provider's late return.
            XCTAssertEqual(task.completions, [false], action); XCTAssertFalse(coordinator.automaticEnabled)
            XCTAssertNil(coordinator.scheduledAt); XCTAssertEqual(vault.snapshot.expenses.count, 1)
            for (name, bytes) in old { XCTAssertEqual(provider.objects[name], bytes) }
            if action == "expiry" || action == "cancel" { XCTAssertEqual(cloud.lastGood, last) }
        }
    }
    func testOnlyTransientFailuresRetryTwiceAndNontransientFailuresPause() async throws {
        for failure in [CloudFailure.transient, .quota, .permission, .historyCapacity, .verification] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), scheduler = FakeBackupScheduler(), key = key
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key })
            var clock = Date(); let coordinator = BackupCoordinator(cloud: cloud, scheduler: scheduler, now: { clock })
            await cloud.enable(); coordinator.setAutomatic(true); clock = clock.addingTimeInterval(901)
            provider.failing = "snapshotUpload"; provider.failure = failure
            let first = FakeBackgroundTask(); scheduler.fire(first); await settle(coordinator)
            XCTAssertEqual(first.completions, [false])
            if failure == .transient {
                XCTAssertTrue(coordinator.automaticEnabled); XCTAssertEqual(cloud.automaticSettings.retryCount, 1)
                XCTAssertEqual(coordinator.scheduledAt, clock.addingTimeInterval(3_600))
                clock = clock.addingTimeInterval(3_601); let second = FakeBackgroundTask(); scheduler.fire(second); await settle(coordinator)
                XCTAssertEqual(second.completions, [false]); XCTAssertEqual(cloud.automaticSettings.retryCount, 2)
                clock = clock.addingTimeInterval(7_201); let third = FakeBackgroundTask(); scheduler.fire(third); await settle(coordinator)
                XCTAssertEqual(third.completions, [false])
            }
            XCTAssertFalse(coordinator.automaticEnabled); XCTAssertNil(coordinator.scheduledAt); XCTAssertNotNil(coordinator.schedulingError)
        }
    }
    func testLockedKeyRevocationAndForegroundInterlock() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), scheduler = FakeBackupScheduler(), key = key
        var locked = false, clock = Date()
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { locked ? nil : key })
        let coordinator = BackupCoordinator(cloud: cloud, scheduler: scheduler, now: { clock })
        await cloud.enable(); coordinator.setAutomatic(true); clock = clock.addingTimeInterval(901)
        locked = true; let lockedTask = FakeBackgroundTask(); scheduler.fire(lockedTask)
        XCTAssertEqual(lockedTask.completions, [false]); XCTAssertFalse(coordinator.automaticEnabled); XCTAssertTrue(provider.objects.isEmpty)
        locked = false; await cloud.enable(); coordinator.setAutomatic(true)
        let blocked = FakeBackgroundTask(); provider.hook = { if $0 == "snapshotUpload" { scheduler.fire(blocked) } }
        coordinator.runForeground { await cloud.publish() }; await settle(coordinator)
        XCTAssertEqual(blocked.completions, [false]); XCTAssertNotNil(cloud.lastGood); XCTAssertEqual(provider.objects.count, 2)
        provider.hook = nil; provider.switchAccount("another-account"); coordinator.reconcile()
        XCTAssertFalse(coordinator.automaticEnabled); XCTAssertNil(coordinator.scheduledAt)
        XCTAssertEqual(vault.snapshot.recordCount, 0)
    }
    func testEarlyWakeAndSchedulerFailureNeverPostOrClaimSuccess() async throws {
        let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
        let vault = VaultStore(directory: dir, key: SymmetricKey(size: .bits256)), provider = FakeCloud(), scheduler = FakeBackupScheduler(), key = key
        let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key }), coordinator = BackupCoordinator(cloud: CloudPublication(vault: vault), scheduler: FakeBackupScheduler())
        XCTAssertFalse(coordinator.canEnableAutomatic)
        let backup = BackupCoordinator(cloud: cloud, scheduler: scheduler)
        await cloud.enable(); scheduler.fails = true; backup.setAutomatic(true)
        XCTAssertNotNil(backup.schedulingError); XCTAssertNil(backup.scheduledAt)
        scheduler.fails = false; backup.reconcile(); let early = FakeBackgroundTask(); scheduler.fire(early)
        XCTAssertEqual(early.completions, [false]); XCTAssertTrue(provider.objects.isEmpty); XCTAssertNotNil(backup.scheduledAt)
    }
    func testFailedOptOutAndRetryPersistenceStayStoppedAfterReopen() async throws {
        for action in ["optout", "retry"] {
            let dir = directory(); defer { try? FileManager.default.removeItem(at: dir) }
            let deviceKey = SymmetricKey(size: .bits256), vault = VaultStore(directory: dir, key: deviceKey), provider = FakeCloud(), scheduler = FakeBackupScheduler(), key = key
            var failWrites = false, clock = Date()
            let cloud = CloudPublication(vault: vault, provider: provider, keyReader: { key }, persistenceCheckpoint: { if failWrites { throw CloudFailure.verification } })
            let backup = BackupCoordinator(cloud: cloud, scheduler: scheduler, now: { clock })
            await cloud.enable(); backup.setAutomatic(true); XCTAssertTrue(backup.automaticEnabled)
            failWrites = true
            if action == "optout" { backup.setAutomatic(false) }
            else {
                clock = clock.addingTimeInterval(901); provider.failing = "snapshotUpload"; provider.failure = .transient
                let task = FakeBackgroundTask(); scheduler.fire(task); await settle(backup); XCTAssertEqual(task.completions, [false])
            }
            XCTAssertFalse(backup.automaticEnabled); XCTAssertNil(backup.scheduledAt)
            let reopened = CloudPublication(vault: VaultStore(directory: dir, key: deviceKey), provider: provider, keyReader: { key })
            XCTAssertFalse(reopened.automaticSettings.enabled)
            let restartedScheduler = FakeBackupScheduler()
            let restarted = BackupCoordinator(cloud: reopened, scheduler: restartedScheduler)
            restarted.reconcile(); XCTAssertTrue(restartedScheduler.requests.isEmpty)
            failWrites = false; backup.setAutomatic(true); XCTAssertTrue(backup.automaticEnabled)
            XCTAssertTrue(CloudPublication(vault: VaultStore(directory: dir, key: deviceKey), provider: provider, keyReader: { key }).automaticSettings.enabled)
        }
    }

}
