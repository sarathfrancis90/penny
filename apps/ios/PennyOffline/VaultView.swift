import SwiftUI
import UniformTypeIdentifiers

struct VaultView: View {
    let backup: BackupCoordinator
    var store: VaultStore
    @State private var recoveryKey = ""
    @State private var keyReentry = ""
    @State private var confirmedKey: String?
    @State private var restoreKey = ""
    @State private var stagedExport: PreparedArchive?
    @State private var work: Task<Void, Never>?
    @State private var action = VaultActionState()
    private var working: Bool { action.working }
    @State private var exporting = false
    @State private var importing = false
    @State private var pendingRestore: FilesRestorePreview?
    @State private var error: String?
    @State private var message: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Your money. Your device.", systemImage: "lock.shield.fill").font(.headline)
                    Text("Your expenses, plans, income and savings are encrypted on this device. No Penny account is needed.").foregroundStyle(Color.pennySecondary)
                }
                PennySection("Encrypted backup") {
                    Text("Choose a folder in Files for a new encrypted backup. Existing backup files are never overwritten. iCloud Drive can be used when available. Keep the recovery key separately; you need it on a new device.")
                    if confirmedKey != nil {
                        Label("A fully confirmed recovery key is stored on this device", systemImage: "checkmark.shield")
                    }
                    DisclosureGroup(confirmedKey == nil ? "Set up a recovery key" : "Set up a different recovery key") {
                        Text("Keep this key outside Penny before confirming it. Losing both your device and this key makes your encrypted backup unreadable.")
                        SecureField("Recovery key to confirm", text: $recoveryKey).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("recoveryCandidate")
                            .onChange(of: recoveryKey) { _, _ in keyReentry = "" }
                        Button("Create a recovery key") { recoveryKey = BackupArchive.newRecoveryKey(); keyReentry = "" }
                        if !recoveryKey.isEmpty {
                            DisclosureGroup("Show recovery key") { Text(recoveryKey).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).privacySensitive() }
                            SecureField("Re-enter the full recovery key", text: $keyReentry).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("recoveryReentry")
                            Button("Confirm recovery key") {
                                do {
                                    try RecoveryKeyStore.confirm(recoveryKey, reentry: keyReentry)
                                    confirmedKey = recoveryKey; recoveryKey = ""; keyReentry = ""
                                    message = "Recovery key confirmed and protected on this device. Keep your separate copy safe."
                                } catch { self.error = error.localizedDescription }
                            }.disabled(keyReentry.isEmpty || working).accessibilityIdentifier("confirmRecoveryKey")
                        }
                    }
                    Button("Save encrypted backup", systemImage: "square.and.arrow.up") { prepareExport() }
                        .disabled(confirmedKey == nil || !store.isReady || working || stagedExport != nil).accessibilityIdentifier("saveEncryptedBackup")
                    if working {
                        ProgressView("Verifying encrypted data…").accessibilityIdentifier("archiveProgress")
                        Button("Cancel vault action", role: .cancel) { cancelWork(); message = "Action cancelled. Your local vault is unchanged. An export already written to Files may remain, but is not confirmed." }
                    }
                    SecureField("Recovery key for restore", text: $restoreKey, prompt: Text("Enter your recovery key").foregroundStyle(.primary)).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(working)
                    Button("Restore a backup", systemImage: "arrow.clockwise.icloud") { importing = true }
                        .disabled(restoreKey.isEmpty || working)
                    if let message { Text(message).font(.footnote).foregroundStyle(Color.pennySecondary) }
                }
                Section { NavigationLink("Optional iCloud backup") { CloudBackupView(backup: backup) } }
                PennySection("Vault capacity") {
                    LabeledContent("Financial records", value: "\(store.snapshot.recordCount)")
                    LabeledContent("Expenses", value: "\(store.snapshot.expenses.count) / 10,000")
                    LabeledContent("Receipts", value: "\(store.snapshot.attachments.count) / 100")
                    LabeledContent("Receipt storage", value: "\(ByteCountFormatter.string(fromByteCount: Int64(store.snapshot.attachments.reduce(0) { $0 + $1.byteCount }), countStyle: .binary)) / 8 MiB")
                    LabeledContent("Saved data", value: "\(ByteCountFormatter.string(fromByteCount: Int64(store.snapshotBytes), countStyle: .binary)) / 15 MiB")
                    DisclosureGroup {
                        LabeledContent("Budgets", value: "\(store.snapshot.budgets.count) / 1,200")
                        LabeledContent("Income sources", value: "\(store.snapshot.incomeSources.count) / 1,000")
                        LabeledContent("Received entries", value: "\(store.snapshot.incomeEntries.count) / 10,000")
                        LabeledContent("Savings goals", value: "\(store.snapshot.savingsGoals.count) / 1,000")
                        LabeledContent("Contributions", value: "\(store.snapshot.savingsEntries.count) / 10,000")
                        LabeledContent("Recurring templates", value: "\(store.snapshot.recurringExpenses.count) / 1,000").accessibilityIdentifier("capacityRecurring")
                    } label: { Text("Finance record limits").font(.body).fixedSize(horizontal: false, vertical: true) }
                    Text("Each receipt can use up to 2 MiB. Encrypted files can use up to 20 MiB, including financial text and receipts. If a limit is reached, the current vault is preserved; nothing is removed automatically.").font(.body).fixedSize(horizontal: false, vertical: true).foregroundStyle(Color.pennySecondary)
                }
                PennySection("On-device intelligence") {
                    Label("Receipt text recognition", systemImage: "doc.text.viewfinder")
                    Text("Receipt images are processed by Apple Vision on this device. Attached JPEG and PNG originals are retained encrypted with their expenses and included in encrypted backups.").font(.footnote).foregroundStyle(Color.pennySecondary)
                    Text(LocalAssistant.availabilityMessage).font(.footnote).foregroundStyle(Color.pennySecondary)
                }
                Section {
                    Text("Files confirms an encrypted export. Use Optional iCloud backup to check whether verified cloud backup is available on this device.").font(.footnote).foregroundStyle(Color.pennySecondary)
                }
            }
            .navigationTitle("Your vault")
            .sheet(isPresented: $exporting) {
                BackupFolderPicker { selected in
                    exporting = false
                    guard let selected else {
                        cancelWork()
                        message = "Export cancelled. Your local vault is unchanged."
                        return
                    }
                    export(to: selected)
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .json]) { result in
                switch result {
                case .success(let url): prepareRestore(url)
                case .failure(let error): self.error = error.localizedDescription
                }
            }
            .onDisappear { cancelWork() }
            .onAppear { do { confirmedKey = try RecoveryKeyStore.load() } catch { self.error = error.localizedDescription } }
            .confirmationDialog("Replace your local financial records?", isPresented: Binding(get: { pendingRestore != nil }, set: { if !$0 { clearRestorePreview() } }), titleVisibility: .visible) {
                Button("Replace with backup", role: .destructive) {
                    guard let pendingRestore else { return }
                    self.pendingRestore = nil
                    cancelWork(); let id = action.begin()
                    work = Task {
                        do {
                            try await pendingRestore.replace(in: store)
                            guard action.id == id, !Task.isCancelled else { return }
                            message = "Restored \(pendingRestore.recordCount) financial records and \(pendingRestore.receiptCount) receipts on this device."
                        } catch { if action.id == id && !Task.isCancelled { self.error = error.localizedDescription } }
                        _ = action.finish(id)
                    }
                }
            } message: {
                Text("This verified backup from \(pendingRestore?.createdAt ?? "") contains \(pendingRestore?.recordCount ?? 0) financial records and \(pendingRestore?.receiptCount ?? 0) receipts. Expense total: \(Money.formatted(pendingRestore?.expenseTotalMinor ?? 0)). It will replace all \(store.snapshot.recordCount) financial records on this device. Save a backup first if you want to keep them.")
            }
            .alert("Vault action failed", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }
    private func clearRestorePreview() {
        let preview = pendingRestore; pendingRestore = nil
        do { try preview?.close() } catch { self.error = error.localizedDescription }
    }
    private func cancelWork() {
        clearRestorePreview()
        action.cancel(); work?.cancel(); work = nil
        if let stagedExport { Task { await ArchiveWorker.shared.cancel(stagedExport) } }
        stagedExport = nil
    }
    private func prepareExport() {
        guard let key = confirmedKey else { return }
        cancelWork(); message = nil; error = nil
        let id = action.begin(), revision = store.revision, snapshot = store.snapshot
        work = Task {
            do {
                let staged = try await ArchiveWorker.shared.prepare(snapshot, key: key)
                guard action.id == id, !Task.isCancelled else { await ArchiveWorker.shared.cancel(staged); return }
                guard store.revision == revision, try RecoveryKeyStore.load() == key else {
                    await ArchiveWorker.shared.cancel(staged); throw CloudFailure.staleRestore
                }
                stagedExport = staged; _ = action.finish(id); exporting = true
            } catch { if action.id == id { _ = action.finish(id); self.error = error.localizedDescription } }
        }
    }
    private func prepareRestore(_ url: URL) {
        cancelWork(); message = nil; error = nil
        let id = action.begin(), key = restoreKey
        restoreKey = ""
        work = Task {
            do {
                let preview = try await store.prepareFilesRestore(url, recoveryKey: key)
                guard action.id == id, !Task.isCancelled else { try preview.close(); return }
                pendingRestore = preview; _ = action.finish(id)
            } catch { if action.id == id { _ = action.finish(id); self.error = error.localizedDescription } }
        }
    }
    private func export(to folder: URL) {
        guard let stagedExport, let id = action.id else { return }
        guard action.resume(id) else { return }
        work = Task {
            do {
                try await ArchiveWorker.shared.export(stagedExport, to: folder)
                await ArchiveWorker.shared.cancel(stagedExport)
                guard action.id == id, !Task.isCancelled else { return }
                self.stagedExport = nil; _ = action.finish(id)
                message = "Encrypted file exported and reopened successfully. Remote backup or iCloud upload completion has not been verified. Keep the matching recovery key separately."
            } catch {
                await ArchiveWorker.shared.cancel(stagedExport)
                if action.id == id { self.stagedExport = nil; _ = action.finish(id); self.error = error.localizedDescription }
            }
        }
    }

}

private struct BackupFolderPicker: UIViewControllerRepresentable {
    let selected: (URL?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected: selected) }
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.allowsMultipleSelection = false; picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let selected: (URL?) -> Void
        init(selected: @escaping (URL?) -> Void) { self.selected = selected }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { selected(nil) }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { selected(urls.first) }
    }
}

/// Shared by every local archive action so late completion cannot reset a newer
/// action's progress or permit overlapping controls after cancellation.
struct VaultActionState {
    private(set) var id: UUID?
    private(set) var working = false
    mutating func begin() -> UUID { let next = UUID(); id = next; working = true; return next }
    mutating func cancel() { id = nil; working = false }
    mutating func resume(_ candidate: UUID) -> Bool { guard id == candidate else { return false }; working = true; return true }
    mutating func finish(_ candidate: UUID) -> Bool { guard id == candidate else { return false }; working = false; return true }
}
