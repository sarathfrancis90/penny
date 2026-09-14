import Foundation
import PennyV4

/// Deliberately unconnected to UI, backup dispatch and candidate installation.
/// Reads one owned source, returns only a summary and never accesses the vault/keychain.
enum V4ReadOnlyAdapter {
    static func validate(source: any PennyV4Input, recoveryKey: String,
                         cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> PennyV4Summary {
        let summary = try PennyV4Reader.validate(source: source, recoveryKey: recoveryKey, admit: { begin in
            guard begin.counts["expenses", default: 0] <= 10_000,
                  begin.counts["attachments", default: 0] <= ReceiptAttachment.maximumCount,
                  begin.receiptBytes <= ReceiptAttachment.maximumTotalBytes else { throw ExpenseError.invalidSnapshot }
            try BackupArchive.validateExportCapacity(Int(begin.nonReceiptBytes))
        }, cancellation: cancellation)
        // This is a conservative v4 read policy, not exact schema3 exportability.
        try BackupArchive.validateExportCapacity(Int(summary.policyMetadataBytes))
        return summary
    }
}
