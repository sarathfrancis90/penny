import SwiftUI

enum FinanceEdit: Identifiable {
    case budget(Budget), income(IncomeSource), goal(SavingsGoal), recurring(RecurringExpense)
    var id: String { switch self { case .budget(let v): v.id; case .income(let v): v.id; case .goal(let v): v.id; case .recurring(let v): v.id } }
    var title: String { switch self { case .budget: "Budget"; case .income: "Income source"; case .goal: "Savings goal"; case .recurring: "Recurring expense" } }
}

struct CivilTextField: View {
    let title: String
    @Binding var value: String
    var body: some View {
        TextField(title + " (YYYY-MM-DD)", text: $value).textInputAutocapitalization(.never).autocorrectionDisabled()
            .accessibilityIdentifier(title + "CivilDate")
    }
}
struct OptionalCivilField: View {
    let title: String
    @Binding var value: String?
    var body: some View { CivilTextField(title: title, value: Binding(get: { value ?? "" }, set: { value = $0.isEmpty ? nil : $0 })) }
}
struct ScheduleFields: View {
    @Binding var schedule: FinanceSchedule
    var body: some View {
        Picker("Frequency", selection: $schedule.frequency) { ForEach(FinanceSchedule.frequencies, id: \.self) { Text($0.capitalized).tag($0) } }
            .onChange(of: schedule.frequency) { _, value in if !["monthly", "yearly"].contains(value) { schedule.dayOfMonth = nil } }
        CivilTextField(title: "Start date", value: $schedule.startDate)
        OptionalCivilField(title: "End date, optional", value: $schedule.endDate)
        if ["monthly", "yearly"].contains(schedule.frequency) {
            Picker("Day of month", selection: $schedule.dayOfMonth) {
                Text("Use start day").tag(nil as Int?)
                ForEach(1...31, id: \.self) { Text("\($0)").tag(Optional($0)) }
            }
            Text("Short months use their final day. The next month returns to the chosen day.").font(.footnote).foregroundStyle(Color.pennySecondary)
        }
    }
}

enum FinanceInput {
    static func money(_ text: String, zero: Bool = false) throws -> Int64 {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if zero && normalized.range(of: #"^0+([.,]0{1,2})?$"#, options: .regularExpression) != nil { return 0 }
        return try Money.parse(normalized)
    }
    static func name(_ value: String) -> String { value.trimmingCharacters(in: FinanceValidation.wireWhitespace) }
}

struct FinanceEditor: View {
    let store: VaultStore
    let target: FinanceEdit
    @Environment(\.dismiss) private var dismiss
    @State private var budget: Budget
    @State private var income: IncomeSource
    @State private var goal: SavingsGoal
    @State private var recurring: RecurringExpense
    @State private var inputs: [String: String]
    @State private var saving = false
    @State private var saveTask: Task<Void, Never>?
    @State private var error: String?
    init(store: VaultStore, target: FinanceEdit) {
        self.store = store; self.target = target
        var b = Budget(), i = IncomeSource(), g = SavingsGoal(), r = RecurringExpense()
        switch target { case .budget(let v): b = v; case .income(let v): i = v; case .goal(let v): g = v; case .recurring(let v): r = v }
        _budget = State(initialValue: b); _income = State(initialValue: i); _goal = State(initialValue: g); _recurring = State(initialValue: r)
        _inputs = State(initialValue: ["limit": store.snapshot.budgets.contains(where: { $0.id == b.id }) ? Money.input(b.limitMinor) : "", "threshold": Money.input(Int64(b.alertThresholdBps)), "gross": store.snapshot.incomeSources.contains(where: { $0.id == i.id }) ? Money.input(i.grossMinor) : "", "net": i.netMinor.map(Money.input) ?? "", "target": store.snapshot.savingsGoals.contains(where: { $0.id == g.id }) ? Money.input(g.targetMinor) : "", "opening": Money.input(g.openingMinor), "monthly": Money.input(g.monthlyContributionMinor), "recurring": store.snapshot.recurringExpenses.contains(where: { $0.id == r.id }) ? Money.input(r.amountMinor) : ""])
    }
    private func money(_ label: String, _ key: String) -> some View {
        TextField(label, text: Binding(get: { inputs[key] ?? "" }, set: { inputs[key] = $0 })).keyboardType(.decimalPad).accessibilityIdentifier("financeAmount-" + key)
    }
    private func options(_ title: String, _ values: [String], _ selected: Binding<String>) -> some View {
        Picker(title, selection: selected) { ForEach(values, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
    }
    var body: some View {
        NavigationStack {
            Form {
                switch target {
                case .budget:
                    ExplainedSection("Monthly budget") {
                        Picker("Expense category", selection: $budget.category) { ForEach(Categories.all, id: \.self) { Text($0).tag($0) } }
                        TextField("Month (YYYY-MM)", text: $budget.month).accessibilityIdentifier("budgetMonth")
                        money("Limit in CAD", "limit")
                        Toggle("Carry unused previous month", isOn: $budget.rollover)
                        money("Alert threshold percent, 0 to 100", "threshold")
                        Toggle("Save alert preference", isOn: $budget.notificationsEnabled)
                    } footer: { Text("Rollover needs a budget in the immediately preceding month. The alert preference is stored locally; notifications are not delivered by this build.") }
                case .income:
                    ExplainedSection("Income source") {
                        TextField("Name", text: $income.name).accessibilityIdentifier("financeName")
                        options("Category", IncomeSource.categories, $income.category)
                        money("Gross suggestion in CAD", "gross"); money("Net suggestion in CAD, optional", "net")
                        Toggle("Taxable", isOn: $income.taxable); Toggle("Active", isOn: $income.isActive)
                        Toggle("Repeats", isOn: $income.isRecurring)
                        TextField("Description", text: $income.description, axis: .vertical)
                    } footer: { Text("Suggested amounts are not received money. Record each actual payment separately. Deactivate a source to keep its history.") }
                    Section("Schedule") { ScheduleFields(schedule: $income.schedule) }
                case .goal:
                    ExplainedSection("Savings goal") {
                        TextField("Name", text: $goal.name).accessibilityIdentifier("financeName")
                        options("Category", SavingsGoal.categories, $goal.category)
                        money("Target in CAD", "target"); money("Opening balance in CAD", "opening"); money("Monthly plan in CAD", "monthly")
                        options("Status", SavingsGoal.statuses, $goal.status); options("Priority", SavingsGoal.priorities, $goal.priority)
                        Toggle("Active", isOn: $goal.isActive)
                        TextField("Description", text: $goal.description, axis: .vertical); TextField("Emoji, optional", text: $goal.emoji)
                    } footer: { Text("Current savings equals opening balance plus saved contributions. Monthly plans never add money automatically. Opening balance excludes contributions entered here.") }
                    Section("Timeline") {
                        CivilTextField(title: "Start date", value: $goal.startDate)
                        OptionalCivilField(title: "Target date, optional", value: $goal.targetDate)
                        OptionalCivilField(title: "Achieved date, optional", value: $goal.achievedDate)
                    }
                case .recurring:
                    ExplainedSection("Expense template") {
                        TextField("Merchant", text: $recurring.merchant).accessibilityIdentifier("financeName")
                        money("Amount in CAD", "recurring")
                        Picker("Category", selection: $recurring.category) { ForEach(Categories.all, id: \.self) { Text($0).tag($0) } }
                        TextField("Description", text: $recurring.description, axis: .vertical); TextField("Note", text: $recurring.note, axis: .vertical)
                        Toggle("Active", isOn: $recurring.isActive)
                    } footer: { Text("A template only proposes expenses. You must review and post each occurrence. Deactivate to preserve posted expense references.") }
                    Section("Schedule") { ScheduleFields(schedule: $recurring.schedule) }
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("financeError") }
            }
            .onDisappear { saveTask?.cancel() }
            .interactiveDismissDisabled(saving)
            .navigationTitle(target.title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { saveTask?.cancel(); dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { saving = true; saveTask = Task { await save(); saving = false } }.disabled(saving).accessibilityIdentifier("saveFinance") }
            }
        }
    }
    private func save() async {
        do {
            let now = CivilDate.timestamp()
            switch target {
            case .budget:
                budget.limitMinor = try FinanceInput.money(inputs["limit"] ?? "", zero: true)
                let threshold = try FinanceInput.money(inputs["threshold"] ?? "", zero: true)
                guard threshold <= 10_000 else { throw ExpenseError.invalidAmount }
                budget.alertThresholdBps = Int(threshold); budget.updatedAt = now; try await store.saveAsync(budget)
            case .income:
                income.name = FinanceInput.name(income.name); income.grossMinor = try FinanceInput.money(inputs["gross"] ?? "")
                let net = inputs["net"] ?? ""; income.netMinor = net.isEmpty ? nil : try FinanceInput.money(net, zero: true)
                income.updatedAt = now; try await store.saveAsync(income)
            case .goal:
                goal.name = FinanceInput.name(goal.name); goal.targetMinor = try FinanceInput.money(inputs["target"] ?? "")
                goal.openingMinor = try FinanceInput.money(inputs["opening"] ?? "", zero: true)
                goal.monthlyContributionMinor = try FinanceInput.money(inputs["monthly"] ?? "", zero: true)
                goal.updatedAt = now; try await store.saveAsync(goal)
            case .recurring:
                recurring.merchant = FinanceInput.name(recurring.merchant); recurring.amountMinor = try FinanceInput.money(inputs["recurring"] ?? "")
                recurring.updatedAt = now; try await store.saveAsync(recurring)
            }
            dismiss()
        } catch { self.error = "Could not save. Check the names, amounts, dates and required fields. Budgets must have a unique category and month. " + error.localizedDescription }
    }
}

private struct ExplainedSection<Content: View, Footer: View>: View {
    let title: String
    let content: Content
    let footer: Footer
    init(_ title: String, @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.title = title; self.content = content(); self.footer = footer()
    }
    var body: some View { Section { content } header: { Text(title) } footer: { footer } }
}

enum LedgerEdit: Identifiable {
    case income(IncomeEntry), savings(SavingsEntry), incomeDue(String, String)
    var id: String { switch self { case .income(let v): v.id; case .savings(let v): v.id; case .incomeDue(let id, let date): id + "/" + date } }
    var isIncome: Bool { if case .savings = self { return false }; return true }
}
struct LedgerEditor: View {
    let store: VaultStore
    let target: LedgerEdit
    @Environment(\.dismiss) private var dismiss
    @State private var income: IncomeEntry
    @State private var savings: SavingsEntry
    @State private var amount: String
    @State private var saving = false
    @State private var saveTask: Task<Void, Never>?
    @State private var error: String?
    init(store: VaultStore, target: LedgerEdit) {
        self.store = store; self.target = target
        var i = IncomeEntry(), s = SavingsEntry()
        switch target {
        case .income(let value): i = value
        case .savings(let value): s = value
        case .incomeDue(let id, let date):
            i.sourceId = id; i.occurrenceDate = date
            if let source = store.snapshot.incomeSources.first(where: { $0.id == id }) { i.amountMinor = source.netMinor ?? source.grossMinor }
        }
        _income = State(initialValue: i); _savings = State(initialValue: s)
        let existing = target.isIncome ? store.snapshot.incomeEntries.contains(where: { $0.id == i.id }) : store.snapshot.savingsEntries.contains(where: { $0.id == s.id })
        let initial: String
        if case .incomeDue = target { initial = i.amountMinor > 0 ? Money.input(i.amountMinor) : "" }
        else { initial = existing ? Money.input(target.isIncome ? i.amountMinor : s.amountMinor) : "" }
        _amount = State(initialValue: initial)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if target.isIncome {
                        Text(store.snapshot.incomeSources.first(where: { $0.id == income.sourceId })?.name ?? "Income")
                        CivilTextField(title: "Received date", value: $income.receivedDate)
                        if let occurrence = income.occurrenceDate { LabeledContent("Reviewed occurrence", value: occurrence) }
                        TextField("Actual received amount in CAD", text: $amount).keyboardType(.decimalPad).accessibilityIdentifier("ledgerAmount")
                        TextField("Note", text: $income.note, axis: .vertical)
                    } else {
                        Text(savings.goalName)
                        CivilTextField(title: "Contribution date", value: $savings.date)
                        TextField("Actual contribution in CAD", text: $amount).keyboardType(.decimalPad).accessibilityIdentifier("ledgerAmount")
                        TextField("Source, optional", text: $savings.source)
                        TextField("Note", text: $savings.note, axis: .vertical)
                        LabeledContent("Recorded type", value: savings.contributionType.replacingOccurrences(of: "_", with: " "))
                    }
                } footer: { Text(target.isIncome ? "Confirm the amount that actually arrived. Source estimates do not count as received money." : "This records a savings allocation, not an additional expense. Withdrawals are not supported.") }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("ledgerError") }
            }
            .onDisappear { saveTask?.cancel() }
            .interactiveDismissDisabled(saving)
            .navigationTitle(target.isIncome ? "Record received income" : "Record contribution").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { saveTask?.cancel(); dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { saving = true; saveTask = Task { await save(); saving = false } }.disabled(saving).accessibilityIdentifier("saveLedger") }
            }
        }
    }
    private func save() async {
        do {
            let minor = try FinanceInput.money(amount), now = CivilDate.timestamp()
            switch target {
            case .incomeDue(let id, let occurrence):
                try await store.postIncomeAsync(id, occurrence: occurrence, receivedDate: income.receivedDate, amountMinor: minor, note: income.note)
            case .income: income.amountMinor = minor; income.updatedAt = now; try await store.saveAsync(income)
            case .savings: savings.amountMinor = minor; savings.updatedAt = now; try await store.saveAsync(savings)
            }
            dismiss()
        } catch { self.error = "Could not save this entry. Check the amount and civil date. " + error.localizedDescription }
    }
}
