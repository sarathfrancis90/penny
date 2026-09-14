// Build-only link probe. No app integration or production crypto wrapper.
import Clibsodium

public func pennySodiumLinkProbe() -> Int32 {
    guard sodium_init() >= 0 else { return -1 }
    let root = [UInt8](repeating: 7, count: 32) // Public synthetic probe data.
    let salt = [UInt8](repeating: 9, count: 32)
    var prk = [UInt8](repeating: 0, count: 32), key = prk
    let context = "PENNY-APPLE-LINK-PROBE"
    guard crypto_kdf_hkdf_sha256_extract(&prk, salt, salt.count, root, root.count) == 0,
          crypto_kdf_hkdf_sha256_expand(&key, key.count, context, context.utf8.count, prk) == 0 else { return -1 }
    var state = crypto_secretstream_xchacha20poly1305_state()
    var header = [UInt8](repeating: 0, count: Int(crypto_secretstream_xchacha20poly1305_headerbytes()))
    guard crypto_secretstream_xchacha20poly1305_init_push(&state, &header, key) == 0 else { return -1 }
    let message: [UInt8] = [1, 2, 3]
    var ciphertext = [UInt8](repeating: 0, count: message.count + Int(crypto_secretstream_xchacha20poly1305_abytes()))
    var count: UInt64 = 0
    return crypto_secretstream_xchacha20poly1305_push(&state, &ciphertext, &count, message, UInt64(message.count), nil, 0, crypto_secretstream_xchacha20poly1305_tag_final())
}
