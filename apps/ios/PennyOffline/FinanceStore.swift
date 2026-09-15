import Foundation

@MainActor extension VaultStore {
    private func upsert<T: Identifiable>(_ record: T, in list: inout [T]) where T.ID: Equatable {
        if let index = list.firstIndex(where: { $0.id == record.id }) { list[index] = record } else { list.append(record) }
    }
    func save(_ record: Budget) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.budgets); try replace(next) }
    func save(_ record: IncomeSource) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.incomeSources); try replace(next) }
    func save(_ record: IncomeEntry) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.incomeEntries); try replace(next) }
    func save(_ record: SavingsGoal) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.savingsGoals); try replace(next) }
    func save(_ record: SavingsEntry) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.savingsEntries); try replace(next) }
    func save(_ record: RecurringExpense) throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.recurringExpenses); try replace(next) }
    func deleteBudget(_ id: String) throws { var next = try compatibilitySnapshot(); next.budgets.removeAll { $0.id == id }; try replace(next) }
    func deleteIncomeEntry(_ id: String) throws { var next = try compatibilitySnapshot(); next.incomeEntries.removeAll { $0.id == id }; try replace(next) }
    func deleteSavingsEntry(_ id: String) throws { var next = try compatibilitySnapshot(); next.savingsEntries.removeAll { $0.id == id }; try replace(next) }
    func saveAsync(_ record: Budget) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.budgets); try await replaceAsync(next) }
    func saveAsync(_ record: IncomeSource) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.incomeSources); try await replaceAsync(next) }
    func saveAsync(_ record: IncomeEntry) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.incomeEntries); try await replaceAsync(next) }
    func saveAsync(_ record: SavingsGoal) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.savingsGoals); try await replaceAsync(next) }
    func saveAsync(_ record: SavingsEntry) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.savingsEntries); try await replaceAsync(next) }
    func saveAsync(_ record: RecurringExpense) async throws { var next = try compatibilitySnapshot(); upsert(record, in: &next.recurringExpenses); try await replaceAsync(next) }
    func deleteBudgetAsync(_ id: String) async throws { var next = try compatibilitySnapshot(); next.budgets.removeAll { $0.id == id }; try await replaceAsync(next) }
    func deleteIncomeEntryAsync(_ id: String) async throws { var next = try compatibilitySnapshot(); next.incomeEntries.removeAll { $0.id == id }; try await replaceAsync(next) }
    func deleteSavingsEntryAsync(_ id: String) async throws { var next = try compatibilitySnapshot(); next.savingsEntries.removeAll { $0.id == id }; try await replaceAsync(next) }
    func postRecurringAsync(_ id: String, occurrence: String, asOf: String = CivilDate.string(Date())) async throws {
        if liveBody.expenses.contains(where: { $0.recurringTemplateId == id && $0.recurringOccurrenceDate == occurrence }) { return }
        let record = try recurringProposal(id, occurrence: occurrence, asOf: asOf); try await saveAsync(record)
    }
    func postIncomeAsync(_ id: String, occurrence: String, receivedDate: String, amountMinor: Int64, note: String = "", asOf: String = CivilDate.string(Date())) async throws {
        if liveBody.incomeEntries.contains(where: { $0.sourceId == id && $0.occurrenceDate == occurrence }) { return }
        let record = try incomeProposal(id, occurrence: occurrence, receivedDate: receivedDate, amountMinor: amountMinor, note: note, asOf: asOf); try await saveAsync(record)
    }
    @discardableResult func postRecurring(_ id: String, occurrence: String, asOf: String = CivilDate.string(Date())) throws -> Expense {
        if let existing = liveBody.expenses.first(where: { $0.recurringTemplateId == id && $0.recurringOccurrenceDate == occurrence }) { return existing }
        let record = try recurringProposal(id, occurrence: occurrence, asOf: asOf); try save(record); return record
    }
    private func recurringProposal(_ id: String, occurrence: String, asOf: String) throws -> Expense {
        guard let template = liveBody.recurringExpenses.first(where: { $0.id == id }), template.isActive,
              template.schedule.contains(occurrence), occurrence <= asOf else { throw ExpenseError.invalidDate }
        var record = try Expense(merchant: template.merchant, amountMinor: template.amountMinor, expenseDate: occurrence,
                                 category: template.category, note: template.note)
        record.description = template.description; record.recurringTemplateId = id; record.recurringOccurrenceDate = occurrence
        return record
    }
    @discardableResult func postIncome(_ id: String, occurrence: String, receivedDate: String, amountMinor: Int64, note: String = "", asOf: String = CivilDate.string(Date())) throws -> IncomeEntry {
        if let existing = liveBody.incomeEntries.first(where: { $0.sourceId == id && $0.occurrenceDate == occurrence }) { return existing }
        let record = try incomeProposal(id, occurrence: occurrence, receivedDate: receivedDate, amountMinor: amountMinor, note: note, asOf: asOf); try save(record); return record
    }
    private func incomeProposal(_ id: String, occurrence: String, receivedDate: String, amountMinor: Int64, note: String, asOf: String) throws -> IncomeEntry {
        guard let source = liveBody.incomeSources.first(where: { $0.id == id }), source.isActive,
              source.schedule.contains(occurrence, enabled: source.isRecurring), occurrence <= asOf else { throw ExpenseError.invalidDate }
        var record = IncomeEntry(); record.sourceId = id; record.receivedDate = receivedDate
        record.amountMinor = amountMinor; record.note = note; record.occurrenceDate = occurrence
        return record
    }
}
