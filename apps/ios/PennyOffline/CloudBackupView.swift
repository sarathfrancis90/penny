import SwiftUI

struct CloudBackupView: View {
    let backup: BackupCoordinator
    private var cloud: CloudPublication { backup.cloud }
    private var vault: VaultStore { cloud.vault }
    @State private var confirmAutomatic = false
    var body: some View {
        Form {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--uitesting") && ProcessInfo.processInfo.arguments.contains("--synthetic-cloud") {
                Section { Label("Synthetic UI test provider · no cloud connection", systemImage: "testtube.2").accessibilityIdentifier("syntheticCloudProvider") }
            }
            #endif
            Section {
                Label("Optional encrypted iCloud backup", systemImage: "icloud.and.arrow.up").font(.headline)
                Text("Your local expenses, reports and on-device intelligence work without iCloud. Backup is disabled until you enable it with a confirmed recovery key.")
                if !cloud.available { Text(CloudFailure.unavailable.localizedDescription).foregroundStyle(Color.pennySecondary).accessibilityIdentifier("cloudUnavailable") }
                if !cloud.hasConfirmedKey { Text("Confirm your recovery key in Your vault first. Keep a separate copy so you can restore on another device.").foregroundStyle(Color.pennySecondary) }
            }
            Section("Backup status") {
                LabeledContent("State", value: cloud.phase)
                if let last = cloud.lastGood {
                    LabeledContent("Last remote verification", value: cloud.completedAt ?? last.verifiedAt)
                    LabeledContent("Verified local revision", value: String(last.localRevision))
                    Text(cloud.pendingChanges ? "Newer local changes are still pending." : "Your current local data was verified in iCloud.")
                } else { Text("No verified iCloud backup is recorded for this account and vault.") }
                if cloud.enabled {
                    Button("Back up now") { run { await cloud.publish() } }.disabled(cloud.isBusy)
                    Button("Disable iCloud backup", role: .destructive) { backup.disableCloud() }
                } else {
                    Button("Enable iCloud backup") { run { await cloud.enable() } }
                        .disabled(!cloud.available || !cloud.hasConfirmedKey || cloud.isBusy).accessibilityIdentifier("enableCloudBackup")
                }
                if cloud.isBusy { ProgressView(cloud.phase); Button("Cancel operation") { backup.cancelByUser() } }
                if let error = cloud.error { Text(error).foregroundStyle(.red).accessibilityIdentifier("cloudError") }
            }
            Section("Automatic backup") {
                Toggle("Back up changes automatically", isOn: Binding(get: { backup.automaticEnabled }, set: { enabled in
                    if enabled { confirmAutomatic = true } else { backup.setAutomatic(false) }
                })).disabled(!backup.automaticEnabled && (!backup.canEnableAutomatic || cloud.isBusy)).accessibilityIdentifier("automaticCloudBackup")
                Text("When enabled, Penny asks iOS to back up pending changes, usually no more than once a day. iOS chooses when to run and may delay or skip a backup. Your device must be unlocked so Penny can use its protected keys.").font(.footnote).foregroundStyle(Color.pennySecondary)
                if let date = backup.scheduledAt { Text("Eligible after \(date.formatted()). This is not a promised run time.").font(.caption) }
                if let error = backup.schedulingError ?? cloud.automaticSettings.pauseReason { Text(error).foregroundStyle(.red).accessibilityIdentifier("automaticBackupError") }
            }
            Section("Find an existing backup") {
                Text("Use the matching recovery key and your iCloud account to discover backups on a new installation. Backups are grouped by the device that created them. Choose the backup you want to restore.")
                Button("Discover encrypted backups") { run { await cloud.discover() } }
                    .disabled(!cloud.available || !cloud.hasConfirmedKey || cloud.isBusy)
                if let warning = cloud.historyWarning { Text(warning).foregroundStyle(Color.pennySecondary) }
            }
            ForEach(cloud.groups) { group in
                Section("Vault \(group.vaultTag.prefix(8)) · writer \(group.writerId.prefix(8))") {
                    if group.hasConflict { Text("Conflicting backups share a writer revision. Review both; neither will be removed.").foregroundStyle(.red) }
                    ForEach(group.candidates) { candidate in
                        Button {
                            run { await cloud.prepareRestore(candidate) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text("Revision \(candidate.localRevision)")
                                Text("Snapshot verified \(candidate.verifiedAt)").font(.caption).foregroundStyle(Color.pennySecondary)
                            }
                        }.disabled(cloud.isBusy)
                    }
                }
            }
            Section {
                Text("Back up now runs when you request it. Automatic backup is optional and starts off. Your earlier backups are retained. Saving an encrypted file in Files is separate from a verified iCloud backup.").font(.footnote).foregroundStyle(Color.pennySecondary)
            }
        }
        .navigationTitle("iCloud backup").navigationBarTitleDisplayMode(.inline)
        .onChange(of: vault.restoreEpoch) { _, _ in backup.reconcile() }
        .onChange(of: vault.revision) { _, _ in backup.reconcile() }
        .confirmationDialog("Replace local financial records?", isPresented: Binding(get: { cloud.preview != nil }, set: { if !$0 { cloud.preview = nil } }), titleVisibility: .visible) {
            Button("Restore selected backup", role: .destructive) {
                guard let selected = cloud.preview else { return }; run { await cloud.confirmRestore(selected) }
            }
        } message: {
            Text("This downloaded, authenticated backup contains \(cloud.preview?.snapshot.recordCount ?? 0) financial records and \(cloud.preview?.snapshot.attachments.count ?? 0) receipts. It will replace all \(vault.snapshot.recordCount) local records. Expense total: \(Money.formatted(cloud.preview?.snapshot.expenses.reduce(0, { $0 + $1.amountMinor }) ?? 0)). Back up current data first if needed.")
        }
        .alert("Enable automatic encrypted backups?", isPresented: $confirmAutomatic) {
            Button("Enable automatic backup") { backup.setAutomatic(true) }
            Button("Cancel", role: .cancel) {}
        } message: { Text("iOS will choose when pending local changes can be backed up. Timing is not guaranteed. Your confirmed recovery key is required, and previous backups are retained.") }
        .onDisappear { backup.cancelForeground() }
    }
    private func run(_ operation: @escaping @MainActor () async -> Void) { backup.runForeground(operation) }
}
