import Foundation
import ImageIO
import UniformTypeIdentifiers
import UIKit

struct PreparedReceipt: Identifiable, Sendable {
    let id = UUID()
    let data: Data
    let optimized: Bool
    let sourceByteCount: Int
}

enum ReceiptPreparation {
    static let maximumInputBytes = 20 * 1_024 * 1_024
    static let maximumPixels = 48_000_000
    enum Failure: LocalizedError {
        case unsupported, tooLarge
        var errorDescription: String? {
            switch self {
            case .unsupported: "This image could not be prepared. Choose a static JPEG, PNG or HEIC receipt, or enter details manually."
            case .tooLarge: "Choose an image up to 20 MiB and 48 megapixels. Nothing was attached."
            }
        }
    }
    static func prepare(_ data: Data) throws -> PreparedReceipt {
        try Task.checkCancellation()
        guard !data.isEmpty, data.count <= maximumInputBytes else { throw Failure.tooLarge }
        if data.starts(with: PNGIntegrity.signature) {
            try PNGIntegrity.validate(data, maximumBytes: maximumInputBytes, maximumSide: 20_000, maximumPixels: maximumPixels)
        }
        if (try? ReceiptAttachment(data: data, expenseId: UUID().uuidString.lowercased())) != nil {
            return PreparedReceipt(data: data, optimized: false, sourceByteCount: data.count)
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let type = CGImageSourceGetType(source) as String?, [UTType.jpeg.identifier, UTType.png.identifier, UTType.heic.identifier].contains(type),
              CGImageSourceGetCount(source) == 1, CGImageSourceGetStatus(source) == .statusComplete,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int else { throw Failure.unsupported }
        guard width > 0, height > 0, width <= 20_000, height <= 20_000, width * height <= maximumPixels else { throw Failure.tooLarge }
        // A one-frame APNG can report one image. Never silently flatten it.
        if type == UTType.png.identifier {
            try PNGIntegrity.validate(data, maximumBytes: maximumInputBytes, maximumSide: 20_000, maximumPixels: maximumPixels)
        }
        let originalByteCount = data.count
        for side in [3_840, 2_560, 1_920, 1_280] {
            try Task.checkCancellation()
            let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: side, kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw Failure.unsupported }
            for quality in [0.85, 0.65] {
                let data = try jpeg(image, quality: quality)
                if data.count <= ReceiptAttachment.maximumBytes {
                    _ = try ReceiptAttachment(data: data, expenseId: UUID().uuidString.lowercased())
                    return PreparedReceipt(data: data, optimized: true, sourceByteCount: originalByteCount)
                }
            }
        }
        throw Failure.tooLarge
    }
    static func camera(_ image: UIImage) throws -> PreparedReceipt {
        let width = Int(image.size.width * image.scale), height = Int(image.size.height * image.scale)
        guard width > 0, height > 0, width <= 20_000, height <= 20_000, width * height <= maximumPixels else { throw Failure.tooLarge }
        let scale = min(1, 3_840 / CGFloat(max(width, height)))
        let size = CGSize(width: CGFloat(width) * scale, height: CGFloat(height) * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let copy = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size)); image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let data = copy.jpegData(compressionQuality: 0.85) else { throw Failure.unsupported }
        let prepared = try prepare(data)
        return PreparedReceipt(data: prepared.data, optimized: true, sourceByteCount: 0)
    }
    private static func jpeg(_ image: CGImage, quality: Double) throws -> Data {
        let result = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(result, UTType.jpeg.identifier as CFString, 1, nil) else { throw Failure.unsupported }
        // A fresh destination omits source location and camera metadata.
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw Failure.unsupported }
        return result as Data
    }
}
