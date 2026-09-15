import SwiftUI
import UniformTypeIdentifiers

struct PennySection<Content: View>: View {
    let title: String
    let content: Content
    init(_ title: String, @ViewBuilder content: () -> Content) { self.title = title; self.content = content() }
    var body: some View {
        Section { content } header: { Text(title).font(.headline).foregroundStyle(Color.pennySecondary).fixedSize(horizontal: false, vertical: true) }
    }
}
private struct ReportMetric: View {
    let title: String
    let value: String
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout())
        layout {
            Text(title).font(.body).fixedSize(horizontal: false, vertical: true)
            if !typeSize.isAccessibilitySize { Spacer() }
            Text(value).font(.body).foregroundStyle(Color.pennySecondary).fixedSize(horizontal: false, vertical: true)
        }.accessibilityElement(children: .combine)
    }
}
struct MonthControl: View {
    @Binding var month: String
    @Environment(\.dynamicTypeSize) private var typeSize
    private var field: some View {
        TextField("YYYY-MM", text: $month).multilineTextAlignment(.center).textInputAutocapitalization(.never)
            .autocorrectionDisabled().frame(minHeight: 44).accessibilityIdentifier("reportMonth").accessibilityLabel("Report month, year and month")
    }
    private func move(_ direction: Int) -> some View {
        Button {
            month = GregorianDay.moveMonth(month, by: direction) ?? month
        } label: {
            Image(systemName: direction < 0 ? "chevron.left" : "chevron.right")
                .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
        }.accessibilityLabel(direction < 0 ? "Previous month" : "Next month")
            .disabled(GregorianDay.moveMonth(month, by: direction) == nil)
    }
    var body: some View {
        Group {
            if typeSize.isAccessibilitySize { VStack { field; HStack { move(-1); Spacer(); move(1) } } }
            else { HStack { move(-1); field; move(1) } }
        }.buttonStyle(.borderless)
    }
}

struct FinanceHome: View {
    var store: VaultStore
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Budgets") { FinanceCollection(store: store, domain: .budgets) }
                    NavigationLink("Income") { FinanceCollection(store: store, domain: .income) }
                    NavigationLink("Savings") { FinanceCollection(store: store, domain: .savings) }
                    NavigationLink("Recurring expenses") { FinanceCollection(store: store, domain: .recurring) }
                } footer: { Text("Plans stay separate from actual entries. Everything here is saved in your encrypted local vault and portable backup.") }
            }.navigationTitle("Your plans")
        }
    }
}
enum FinanceDomain: String { case budgets = "Budgets", income = "Income", savings = "Savings", recurring = "Recurring expenses" }
private struct DueOccurrence: Identifiable {
    let owner: String
    let date: String
    let name: String
    let amount: Int64
    var id: String { owner + "/" + date }
}
struct FinanceCollection: View {
    var store: VaultStore
    let domain: FinanceDomain
    @State private var month = String(CivilDate.string(Date()).prefix(7))
    @State private var edit: FinanceEdit?
    @State private var ledger: LedgerEdit?
    @State private var pendingDue: DueOccurrence?
    @State private var pendingDelete: (() async throws -> Void)?
    @State private var error: String?
    private var dues: [DueOccurrence] {
        guard GregorianDay.validMonth(month) else { return [] }
        let c = GregorianDay.components(month)
        let from = month + "-01", to = min(CivilDate.string(Date()), String(format: "%@-%02d", month, GregorianDay.daysInMonth(c.year, c.month)))
        guard from <= to else { return [] }
        var result: [DueOccurrence] = []
        if domain == .income {
            let posted = Set(store.liveBody.incomeEntries.compactMap { entry in entry.occurrenceDate.map { entry.sourceId + "/" + $0 } })
            for source in store.liveBody.incomeSources where source.isActive {
                let dates = (try? source.schedule.occurrences(from: from, to: to, enabled: source.isRecurring)) ?? []
                for date in dates where !posted.contains(source.id + "/" + date) {
                    result.append(DueOccurrence(owner: source.id, date: date, name: source.name, amount: source.netMinor ?? source.grossMinor))
                }
            }
        } else {
            let posted = Set(store.liveBody.expenses.compactMap { expense in expense.recurringOccurrenceDate.map { expense.recurringTemplateId! + "/" + $0 } })
            for template in store.liveBody.recurringExpenses where template.isActive {
                let dates = (try? template.schedule.occurrences(from: from, to: to)) ?? []
                for date in dates where !posted.contains(template.id + "/" + date) {
                    result.append(DueOccurrence(owner: template.id, date: date, name: template.merchant, amount: template.amountMinor))
                }
            }
        }
        return result.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }

    var body: some View {
        List {
            if domain != .savings {
                Section { MonthControl(month: $month) }
                if !GregorianDay.validMonth(month) { Text("Enter a month from 0001-01 to 9999-12.").foregroundStyle(.red) }
            }
            switch domain {
            case .budgets:
                Section("Budgets for \(month)") {
                    ForEach(FinanceEngine.budgets(store.liveBody, month: month)) { position in
                        Button { edit = .budget(position.budget) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(position.budget.category).foregroundStyle(.primary)
                                Text("\(Money.formatted(position.spent)) spent of \(Money.formatted(position.available))").foregroundStyle(Color.pennySecondary)
                                Text("\(Money.formatted(position.remaining)) remaining · \(Money.formatted(position.carry)) carried")
                                    .font(.caption).foregroundStyle(position.remaining < 0 ? .red : .secondary)
                                if position.thresholdReached { Label("Budget threshold reached", systemImage: "exclamationmark.circle").font(.caption) }
                            }
                        }.accessibilityIdentifier("budgetRow-" + position.budget.id)
                        .swipeActions { Button("Delete", role: .destructive) { pendingDelete = { try await store.deleteBudgetAsync(position.id) } } }
                    }
                    if FinanceEngine.budgets(store.liveBody, month: month).isEmpty { Text("No budget set for this month.").foregroundStyle(Color.pennySecondary) }
                }
            case .income:
                Section("Income sources") {
                    ForEach(store.liveBody.incomeSources) { source in
                        VStack(alignment: .leading, spacing: 8) {
                            Button { edit = .income(source) } label: { Label(source.name + (source.isActive ? "" : " · Inactive"), systemImage: "briefcase") }
                                .accessibilityIdentifier("incomeSource-" + source.name)
                            Text("Gross plan \(Money.formatted(source.grossMinor)) · \(source.category.replacingOccurrences(of: "_", with: " "))").font(.caption).foregroundStyle(Color.pennySecondary)
                            Button("Record unscheduled payment") { var entry = IncomeEntry(); entry.sourceId = source.id; ledger = .income(entry) }.disabled(!source.isActive)
                                .accessibilityIdentifier("recordIncome-" + source.name)
                        }.buttonStyle(.borderless)
                    }
                    if store.liveBody.incomeSources.isEmpty { Text("Add a source, then record payments actually received.").foregroundStyle(Color.pennySecondary) }
                }
                dueSection
                Section("Received in \(month)") {
                    ForEach(store.liveBody.incomeEntries.filter { $0.receivedDate.hasPrefix(month + "-") }.sorted { $0.receivedDate > $1.receivedDate }) { entry in
                        Button { ledger = .income(entry) } label: {
                            VStack(alignment: .leading) {
                                Text(store.liveBody.incomeSources.first(where: { $0.id == entry.sourceId })?.name ?? "Income")
                                Text("\(entry.receivedDate) · \(Money.formatted(entry.amountMinor))").font(.caption).foregroundStyle(Color.pennySecondary)
                            }
                        }.accessibilityIdentifier("incomeEntry-" + entry.id)
                        .swipeActions { Button("Delete", role: .destructive) { pendingDelete = { try await store.deleteIncomeEntryAsync(entry.id) } } }
                    }
                }
            case .savings:
                Section("Your goals") {
                    ForEach(store.liveBody.savingsGoals) { goal in
                        let progress = FinanceEngine.savings(store.liveBody, goal: goal)
                        VStack(alignment: .leading, spacing: 8) {
                            Button { edit = .goal(goal) } label: { Text(goal.name + (goal.isActive ? "" : " · Inactive")) }.accessibilityIdentifier("savingsGoal-" + goal.name)
                            ProgressView(value: Double(progress.progressBps), total: 10_000).accessibilityLabel("\(progress.progressBps / 100) percent saved")
                            Text("\(Money.formatted(progress.current)) of \(Money.formatted(goal.targetMinor)) · \(goal.status)").font(.caption)
                            Button("Record contribution") { var entry = SavingsEntry(); entry.goalId = goal.id; entry.goalName = goal.name; ledger = .savings(entry) }
                                .disabled(!goal.isActive).accessibilityIdentifier("recordSavings-" + goal.name)
                        }.buttonStyle(.borderless)
                    }
                    if store.liveBody.savingsGoals.isEmpty { Text("Start with a goal and record each real contribution.").foregroundStyle(Color.pennySecondary) }
                }
                Section("Contribution history") {
                    ForEach(store.liveBody.savingsEntries.sorted { $0.date > $1.date }) { entry in
                        Button { ledger = .savings(entry) } label: { Text("\(entry.goalName) · \(entry.date) · \(Money.formatted(entry.amountMinor))") }
                            .accessibilityIdentifier("savingsEntry-" + entry.id)
                            .swipeActions { Button("Delete", role: .destructive) { pendingDelete = { try await store.deleteSavingsEntryAsync(entry.id) } } }
                    }
                }
            case .recurring:
                Section("Expense templates") {
                    ForEach(store.liveBody.recurringExpenses) { template in
                        Button { edit = .recurring(template) } label: {
                            VStack(alignment: .leading) {
                                Text(template.merchant + (template.isActive ? "" : " · Inactive"))
                                Text("\(Money.formatted(template.amountMinor)) · \(template.schedule.frequency)").font(.caption).foregroundStyle(Color.pennySecondary)
                            }
                        }.accessibilityIdentifier("recurringTemplate-" + template.merchant)
                    }
                    if store.liveBody.recurringExpenses.isEmpty { Text("Add a template to review recurring dues.").foregroundStyle(Color.pennySecondary) }
                }
                dueSection
            }
        }
        .navigationTitle(domain.rawValue)
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Add", systemImage: "plus") { add() }.accessibilityIdentifier("addFinance") } }
        .sheet(item: $edit) { FinanceEditor(store: store, target: $0) }
        .sheet(item: $ledger) { LedgerEditor(store: store, target: $0) }
        .confirmationDialog("Post this reviewed expense?", isPresented: Binding(get: { pendingDue != nil }, set: { if !$0 { pendingDue = nil } }), titleVisibility: .visible) {
            Button("Post expense") {
                guard let due = pendingDue else { return }
                Task { do { try await store.postRecurringAsync(due.owner, occurrence: due.date) } catch { self.error = error.localizedDescription } }
                pendingDue = nil
            }
        } message: { Text("\(pendingDue?.name ?? "") · \(pendingDue?.date ?? "") · \(Money.formatted(pendingDue?.amount ?? 0)). This adds one expense to your local ledger.") }
        .confirmationDialog("Delete this record?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible) {
            Button("Delete record", role: .destructive) {
                let action = pendingDelete; pendingDelete = nil
                Task { do { try await action?() } catch { self.error = error.localizedDescription } }
            }
        } message: { Text("This changes local totals. Previous backup files are unchanged.") }
        .alert("Could not save", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
    }
    private var dueSection: some View {
        Section("Review due through today in \(month)") {
            ForEach(dues) { due in
                Button {
                    if domain == .income { ledger = .incomeDue(due.owner, due.date) } else { pendingDue = due }
                } label: { VStack(alignment: .leading) { Text(due.name); Text("\(due.date) · \(Money.formatted(due.amount)) · Review").font(.caption).foregroundStyle(Color.pennySecondary) } }
                    .accessibilityIdentifier("reviewDue-" + due.name)
            }
            if dues.isEmpty { Text("No unposted dues in this month through today.").foregroundStyle(Color.pennySecondary) }
        }
    }
    private func add() {
        switch domain {
        case .budgets: var value = Budget(); value.month = GregorianDay.validMonth(month) ? month : String(CivilDate.string(Date()).prefix(7)); edit = .budget(value)
        case .income: edit = .income(IncomeSource())
        case .savings: edit = .goal(SavingsGoal())
        case .recurring: edit = .recurring(RecurringExpense())
        }
    }
}

struct ExpenseCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
struct ReportsView: View {
    var store: VaultStore
    @State private var month = String(CivilDate.string(Date()).prefix(7))
    @State private var confirmingExport = false
    @State private var exporting = false
    @State private var csv: ExpenseCSVDocument?
    @State private var status: String?
    var body: some View {
        NavigationStack {
            List {
                Section { MonthControl(month: $month) }
                if GregorianDay.validMonth(month) {
                    let report = FinanceEngine.report(store.liveBody, month: month)
                    PennySection("Actual activity in CAD") {
                        ReportMetric(title: "Received", value: Money.formatted(report.received)).accessibilityIdentifier("reportReceived")
                        ReportMetric(title: "Expenses", value: Money.formatted(report.expenses)).accessibilityIdentifier("reportExpenses")
                        ReportMetric(title: "Received minus expenses", value: Money.formatted(report.net)).accessibilityIdentifier("reportNet")
                        ReportMetric(title: "Savings contributions", value: Money.formatted(report.contributions)).accessibilityIdentifier("reportSavings")
                        Text("Savings contributions are internal allocations and are not subtracted again. Planned income and unposted templates are excluded.").font(.body).fixedSize(horizontal: false, vertical: true).foregroundStyle(Color.pennySecondary)
                    }
                    PennySection("Income categories") { ForEach(report.incomeCategories.filter { $0.amount > 0 }, id: \.category) { row in LabeledContent(row.category.replacingOccurrences(of: "_", with: " ").capitalized, value: Money.formatted(row.amount)) } }
                    PennySection("Expense categories") { ForEach(report.categories.filter { $0.amount > 0 }, id: \.category) { row in LabeledContent(row.category, value: Money.formatted(row.amount)) } }
                } else { Text("Enter a month in YYYY-MM format, from 0001-01 to 9999-12.").foregroundStyle(.red) }
                Section {
                    Button { confirmingExport = true } label: { Label("Export all expenses as CSV", systemImage: "square.and.arrow.up").font(.body).fixedSize(horizontal: false, vertical: true).frame(minHeight: 44) }.accessibilityIdentifier("exportCSV")
                    if let status { Text(status).font(.footnote).foregroundStyle(Color.pennySecondary) }
                }
            }.contentMargins(.bottom, 32, for: .scrollContent).navigationTitle("Reports")
            .alert("Export readable financial data?", isPresented: $confirmingExport) {
                Button("Cancel", role: .cancel) {}
                Button("Create readable CSV") { csv = ExpenseCSVDocument(data: FinanceEngine.csv(store.liveBody.expenses)); exporting = true }
            } message: { Text("CSV contains all expenses, descriptions and notes in readable form. Choose a private destination. Use encrypted backup for recovery of all your data.") }
            .fileExporter(isPresented: $exporting, document: csv, contentType: .commaSeparatedText, defaultFilename: "Penny-expenses.csv") { result in
                switch result { case .success: status = "CSV exported."; case .failure(let error): status = "CSV was not exported: " + error.localizedDescription }
                csv = nil
            }
        }
    }
}
