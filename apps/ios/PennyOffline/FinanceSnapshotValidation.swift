import Foundation

extension VaultSnapshot {
    func validateFinance() throws {
        func unique<T: Identifiable>(_ records: [T], limit: Int, name: String) throws where T.ID: Hashable {
            guard records.count <= limit else { throw ExpenseError.recordCapacity(name, limit) }
            try FinanceValidation.require(Set(records.map(\.id)).count == records.count)
        }
        try unique(budgets, limit: 1_200, name: "budgets"); try unique(incomeSources, limit: 1_000, name: "income sources"); try unique(incomeEntries, limit: 10_000, name: "received entries")
        try unique(savingsGoals, limit: 1_000, name: "savings goals"); try unique(savingsEntries, limit: 10_000, name: "savings contributions"); try unique(recurringExpenses, limit: 1_000, name: "recurring templates")
        try budgets.forEach { try $0.validate() }; try incomeSources.forEach { try $0.validate() }; try incomeEntries.forEach { try $0.validate() }
        try savingsGoals.forEach { try $0.validate() }; try savingsEntries.forEach { try $0.validate() }; try recurringExpenses.forEach { try $0.validate() }
        try FinanceValidation.require(Set(budgets.map { $0.category + "/" + $0.month }).count == budgets.count)
        let sources = Set(incomeSources.map(\.id)), goals = Set(savingsGoals.map(\.id)), templates = Set(recurringExpenses.map(\.id))
        try FinanceValidation.require(incomeEntries.allSatisfy { sources.contains($0.sourceId) })
        try FinanceValidation.require(savingsEntries.allSatisfy { goals.contains($0.goalId) })
        try FinanceValidation.require(expenses.allSatisfy { $0.recurringTemplateId == nil || templates.contains($0.recurringTemplateId!) })
        let incomeOccurrences = incomeEntries.compactMap { record in record.occurrenceDate.map { record.sourceId + "/" + $0 } }
        let expenseOccurrences = expenses.compactMap { record in record.recurringOccurrenceDate.map { record.recurringTemplateId! + "/" + $0 } }
        try FinanceValidation.require(Set(incomeOccurrences).count == incomeOccurrences.count && Set(expenseOccurrences).count == expenseOccurrences.count)
        _ = try FinanceValidation.total(incomeEntries.map(\.amountMinor))
        _ = try FinanceValidation.total(savingsGoals.map(\.openingMinor) + savingsEntries.map(\.amountMinor))
        for goal in savingsGoals { _ = try FinanceValidation.total([goal.openingMinor] + savingsEntries.filter { $0.goalId == goal.id }.map(\.amountMinor)) }
    }
}
