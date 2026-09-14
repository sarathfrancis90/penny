// Frozen stateless prototype support from apps/ios/PennyOffline/ReceiptAttachment.swift; see source-provenance.json.
import CryptoKit
import Foundation
import ImageIO

struct ReceiptAttachment: Codable, Identifiable, Equatable, Sendable {
    static let maximumBytes = 2 * 1_024 * 1_024
    static let maximumTotalBytes = 8 * 1_024 * 1_024
    static let maximumCount = 100
    let id: String
    let expenseId: String
    let mediaType: String
    let byteCount: Int
    let sha256: String
    let dataBase64: String

    init(data: Data, expenseId: String) throws {
        guard data.count <= Self.maximumBytes else { throw ReceiptError.tooLarge }
        self.id = UUID().uuidString.lowercased()
        self.expenseId = expenseId
        self.mediaType = data.starts(with: [0x89, 0x50, 0x4e, 0x47]) ? "image/png" : "image/jpeg"
        self.byteCount = data.count
        self.sha256 = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        self.dataBase64 = data.base64EncodedString()
        try validate()
    }
    func bytes() throws -> Data {
        guard byteCount > 0, byteCount <= Self.maximumBytes,
              dataBase64.utf8.count <= 4 * ((Self.maximumBytes + 2) / 3),
              let data = Data(base64Encoded: dataBase64), data.count == byteCount,
              data.base64EncodedString() == dataBase64,
              sha256.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == sha256 else { throw ReceiptError.invalid }
        return data
    }
    func validate() throws {
        guard Self.canonicalID(id), Self.canonicalID(expenseId) else { throw ReceiptError.invalid }
        let data = try bytes()
        let png = data.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            && data.count >= 45 && Array(data[8..<12]) == [0, 0, 0, 13] && Array(data[12..<16]) == Array("IHDR".utf8)
        if png { try Self.validateStaticPNG(data) }
        let jpeg = data.starts(with: [0xff, 0xd8, 0xff]) && data.suffix(2) == Data([0xff, 0xd9])
        guard (mediaType == "image/png" && png) || (mediaType == "image/jpeg" && jpeg),
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1, CGImageSourceGetStatus(source) == .statusComplete,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 4_096, height <= 4_096, width * height <= 16_000_000,
              CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) != nil else { throw ReceiptError.invalid }
    }
    static func validateStaticPNG(_ data: Data) throws {
        try PNGIntegrity.validate(data, maximumBytes: maximumBytes, maximumSide: 4_096, maximumPixels: 16_000_000)
    }
    private static func canonicalID(_ value: String) -> Bool {
        UUID(uuidString: value)?.uuidString.lowercased() == value
    }
    enum ReceiptError: LocalizedError {
        case tooLarge, invalid, capacity
        var errorDescription: String? {
            switch self {
            case .tooLarge: "Choose a JPEG or PNG receipt up to 2 MiB. The original was not attached."
            case .invalid: "Choose a valid JPEG or PNG receipt up to 4096 pixels per side and 16 megapixels. The original was not attached."
            case .capacity: "This vault supports up to 100 receipts and 8 MiB of original receipt files. Your saved data has not changed."
            }
        }
    }
}
