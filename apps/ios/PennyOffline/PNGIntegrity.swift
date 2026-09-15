import Foundation
import zlib

/// ImageIO tolerates damaged scanline streams. Validate the bounded original
/// container and zlib stream before it is decoded, saved or converted.
enum PNGIntegrity {
    static let signature: [UInt8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

    static func validate(_ data: Data, maximumBytes: Int, maximumSide: Int, maximumPixels: Int) throws {
        let invalid = ReceiptAttachment.ReceiptError.invalid
        guard data.count >= 45, data.count <= maximumBytes, data.starts(with: signature) else { throw invalid }
        func integer(_ offset: Int) -> Int { data[offset..<offset + 4].reduce(0) { ($0 << 8) | Int($1) } }
        guard integer(8) == 13, data[12..<16].elementsEqual("IHDR".utf8) else { throw invalid }
        let width = integer(16), height = integer(20), depth = Int(data[24]), color = Int(data[25])
        guard width > 0, height > 0, width <= maximumSide, height <= maximumSide,
              width <= maximumPixels / height, data[26] == 0, data[27] == 0, data[28] <= 1 else { throw invalid }
        let channels: Int
        switch color {
        case 0: guard [1, 2, 4, 8, 16].contains(depth) else { throw invalid }; channels = 1
        case 2: guard [8, 16].contains(depth) else { throw invalid }; channels = 3
        case 3: guard [1, 2, 4, 8].contains(depth) else { throw invalid }; channels = 1
        case 4: guard [8, 16].contains(depth) else { throw invalid }; channels = 2
        case 6: guard [8, 16].contains(depth) else { throw invalid }; channels = 4
        default: throw invalid
        }
        var offset = 8, hasPalette = false, hasIDAT = false, endedIDAT = false, hasEnd = false
        var compressed = Data()
        while offset + 12 <= data.count {
            try Task.checkCancellation()
            let length = integer(offset)
            guard length <= data.count - offset - 12 else { throw invalid }
            let typeBytes = data[offset + 4..<offset + 8]
            guard typeBytes.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) }),
                  data[offset + 6] & 32 == 0 else { throw invalid }
            let type = String(decoding: typeBytes, as: UTF8.self)
            let checksum = data.withUnsafeBytes { bytes in
                crc32(0, bytes.bindMemory(to: UInt8.self).baseAddress!.advanced(by: offset + 4), uInt(length + 4))
            }
            guard checksum == uLong(integer(offset + 8 + length)) else { throw invalid }
            if hasIDAT && type != "IDAT" { endedIDAT = true }
            switch type {
            case "IHDR": guard offset == 8, length == 13 else { throw invalid }
            case "PLTE":
                guard !hasPalette, !hasIDAT, color != 0, color != 4,
                      length > 0, length <= 768, length % 3 == 0,
                      color != 3 || length / 3 <= (1 << depth) else { throw invalid }
                hasPalette = true
            case "IDAT":
                guard !endedIDAT, color != 3 || hasPalette else { throw invalid }
                hasIDAT = true
                compressed.append(data[offset + 8..<offset + 8 + length])
            case "IEND":
                guard hasIDAT, length == 0, offset + 12 == data.count else { throw invalid }
                hasEnd = true
            case "acTL", "fcTL", "fdAT": throw invalid
            default: guard data[offset + 4] & 32 != 0 else { throw invalid }
            }
            offset += length + 12
        }
        guard hasEnd, offset == data.count, !compressed.isEmpty else { throw invalid }
        // Every nonempty Adam7 pass has independently packed rows and one filter
        // byte per row. Empty passes contribute no bytes, including no filter.
        let passes = data[28] == 0 ? [(0, 0, 1, 1)] :
            [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
        var rows: [Int] = []
        for (x, y, dx, dy) in passes where width > x && height > y {
            let passWidth = (width - x + dx - 1) / dx, passHeight = (height - y + dy - 1) / dy
            let rowBytes = (passWidth * channels * depth + 7) / 8 + 1
            rows.append(contentsOf: repeatElement(rowBytes, count: passHeight))
        }
        try validateStream(compressed, rows: rows)
    }

    private static func validateStream(_ compressed: Data, rows: [Int]) throws {
        let invalid = ReceiptAttachment.ReceiptError.invalid
        var stream = z_stream()
        guard inflateInit_(&stream, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else { throw invalid }
        defer { inflateEnd(&stream) }
        let expectedBytes = rows.reduce(0, +)
        var output = [UInt8](repeating: 0, count: 32 * 1_024)
        var rowIndex = 0, rowRemaining = 0
        try compressed.withUnsafeBytes { input in
            stream.next_in = UnsafeMutablePointer(mutating: input.bindMemory(to: UInt8.self).baseAddress!)
            stream.avail_in = uInt(compressed.count)
            while true {
                try Task.checkCancellation()
                let inputBefore = stream.total_in
                let status = output.withUnsafeMutableBytes { buffer in
                    stream.next_out = buffer.bindMemory(to: UInt8.self).baseAddress!
                    stream.avail_out = uInt(buffer.count)
                    return inflate(&stream, Z_NO_FLUSH)
                }
                let produced = output.count - Int(stream.avail_out)
                guard stream.total_out <= expectedBytes else { throw invalid }
                var index = 0
                while index < produced {
                    if rowRemaining == 0 {
                        guard rowIndex < rows.count, output[index] <= 4 else { throw invalid }
                        rowRemaining = rows[rowIndex]; rowIndex += 1
                    }
                    let consumed = min(rowRemaining, produced - index)
                    rowRemaining -= consumed; index += consumed
                }
                if status == Z_STREAM_END {
                    guard stream.avail_in == 0, stream.total_in == compressed.count,
                          stream.total_out == expectedBytes, rowIndex == rows.count, rowRemaining == 0 else { throw invalid }
                    return
                }
                guard status == Z_OK, produced > 0 || stream.total_in > inputBefore else { throw invalid }
            }
        }
    }
}
