import SwiftUI

@main
struct PennyOfflineApp: App {
    @State private var store: VaultStore
    @State private var backup: BackupCoordinator
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--uitesting") {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("PennyUITests")
            if ProcessInfo.processInfo.arguments.contains("--reset-vault") { try? FileManager.default.removeItem(at: directory) }
            let vault = VaultStore(directory: directory)
            _store = State(initialValue: vault)
            if ProcessInfo.processInfo.arguments.contains("--synthetic-cloud") {
                let cloud = CloudPublication(vault: vault, provider: UITestCloudTransport(), keyReader: { UITestCloudTransport.publicKey })
                _backup = State(initialValue: BackupCoordinator(cloud: cloud, scheduler: UITestBackupScheduler()))
            } else { _backup = State(initialValue: BackupCoordinator(cloud: CloudPublication(vault: vault))) }
            return
        }
        #endif
        let vault = VaultStore()
        _store = State(initialValue: vault)
        _backup = State(initialValue: BackupCoordinator(cloud: CloudPublication(vault: vault)))
    }
    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView(backup: backup, store: store)
                if scenePhase != .active {
                    Color(.systemBackground).ignoresSafeArea()
                    Label("Penny Offline", systemImage: "lock.shield.fill").font(.title2.bold())
                }
            }
            #if DEBUG
            .modifier(VisualTestTraits())
            #endif
            .tint(Color.pennyAccent)
            .onChange(of: scenePhase) { _, _ in backup.reconcile() }
            .onChange(of: store.revision) { _, _ in backup.reconcile() }
            .onChange(of: store.restoreEpoch) { _, _ in backup.reconcile() }
            .onChange(of: backup.cloud.isBusy) { _, _ in backup.reconcile() }
            .onChange(of: backup.cloud.enabled) { _, _ in backup.reconcile() }
        }
    }
}

struct RootView: View {
    let backup: BackupCoordinator
    @Bindable var store: VaultStore
    @State private var recovering = false
    var body: some View {
        if store.isReady {
            TabView {
                Tab("Expenses", systemImage: "wallet.bifold") { ExpensesView(store: store) }
                Tab("Plans", systemImage: "chart.pie") { FinanceHome(store: store) }
                Tab("Reports", systemImage: "chart.bar") { ReportsView(store: store) }
                Tab("Vault", systemImage: "lock.shield") { VaultView(backup: backup, store: store) }
            }
        } else {
            ContentUnavailableView {
                Label("Your vault is protected", systemImage: "lock.shield")
            } description: {
                Text(store.errorMessage ?? "Unable to open your local expenses.")
            } actions: {
                Button("Try again") { store.load() }.buttonStyle(.glassProminent).tint(Color.pennyButton).foregroundStyle(.white)
                Button("Restore encrypted backup") { recovering = true }
            }
            .sheet(isPresented: $recovering) { VaultView(backup: backup, store: store) }
        }
    }
}

#if DEBUG
private struct VisualTestTraits: ViewModifier {
    func body(content: Content) -> some View {
        if ProcessInfo.processInfo.arguments.contains("--uitesting") && ProcessInfo.processInfo.arguments.contains("--visual-large-dark") {
            content.dynamicTypeSize(.accessibility3).preferredColorScheme(.dark)
        } else { content }
    }
}
#endif
