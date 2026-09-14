#include <jni.h>
#include <sodium.h>
#include <array>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <unordered_map>
#include <vector>
#include <cstring>

namespace {
constexpr size_t CHUNK = 1048576, OVERHEAD = 17, HEADER = 70;
constexpr uint64_t MAX_PLAIN = 671088640, MAX_WIRE = 805306368, MAX_FRAMES = 640;
constexpr unsigned char MAGIC[] = {'P','N','Y','B','K','P','4','\n'};
constexpr char INFO[] = "PENNY-OFFLINE-BACKUP:4:SECRETSTREAM";
constexpr char DOMAIN[] = "PENNY-OFFLINE-BACKUP:4:FRAME";
static_assert(sizeof(INFO) - 1 == 35);
static_assert(sizeof(DOMAIN) == 29); // Includes exactly one NUL in AAD.

void need(bool ok, const char* reason) { if (!ok) throw std::runtime_error(reason); }
struct Bytes {
    std::vector<unsigned char> value;
    explicit Bytes(size_t n) : value(n) {}
    ~Bytes() { sodium_memzero(value.data(), value.size()); }
    unsigned char* data() { return value.data(); }
};
struct Key {
    std::array<unsigned char, 32> value{};
    ~Key() { sodium_memzero(value.data(), value.size()); }
    unsigned char* data() { return value.data(); }
};
struct State {
    crypto_secretstream_xchacha20poly1305_state stream{};
    std::array<unsigned char, HEADER> header{};
    const bool encoder;
    const std::thread::id owner = std::this_thread::get_id();
    uint64_t sequence = 0, plain = 0, wire = HEADER;
    explicit State(bool push) : encoder(push) {}
    ~State() { sodium_memzero(&stream, sizeof(stream)); sodium_memzero(header.data(), header.size()); }
};
// IDs are monotonically allocated, never native addresses and never reused in
// this process. One mutex serializes lookup/use/erase, including cross-thread close.
std::mutex registryMutex;
std::unordered_map<jlong, std::unique_ptr<State>> states;
uint64_t nextId = 1;
void initialize() {
    static const bool ready = [] {
        return sodium_init() >= 0 && crypto_secretstream_xchacha20poly1305_keybytes() == 32 &&
            crypto_secretstream_xchacha20poly1305_headerbytes() == 24 &&
            crypto_secretstream_xchacha20poly1305_abytes() == OVERHEAD &&
            crypto_secretstream_xchacha20poly1305_tag_message() == 0 &&
            crypto_secretstream_xchacha20poly1305_tag_final() == 3 &&
            crypto_kdf_hkdf_sha256_keybytes() == 32;
    }();
    need(ready, "Unexpected libsodium runtime constants");
}
void javaFailure(JNIEnv* env, const char* reason) {
    if (!env->ExceptionCheck()) {
        jclass cls = env->FindClass("java/lang/IllegalStateException");
        if (cls != nullptr) env->ThrowNew(cls, reason);
    }
}
template<class T, class F> T guarded(JNIEnv* env, jlong id, T fallback, F&& work) {
    std::lock_guard<std::mutex> guard(registryMutex);
    try { initialize(); return work(); }
    catch (const std::exception& error) {
        if (id > 0) states.erase(id);
        javaFailure(env, error.what()); return fallback;
    } catch (...) {
        if (id > 0) states.erase(id);
        javaFailure(env, "Native frame failure"); return fallback;
    }
}
State& get(jlong id, bool encoder) {
    auto found = states.find(id);
    need(id > 0 && found != states.end(), "Invalid or closed native frame handle");
    State& state = *found->second;
    need(state.encoder == encoder, "Native frame handle has the wrong operation type");
    need(state.owner == std::this_thread::get_id(), "Native frame state is confined to its creating thread");
    return state;
}
jlong registerState(std::unique_ptr<State> state) {
    need(states.size() < 64, "Too many active frame operations");
    need(nextId <= static_cast<uint64_t>(std::numeric_limits<jlong>::max()), "Native frame handles exhausted");
    jlong id = static_cast<jlong>(nextId++);
    states.emplace(id, std::move(state));
    return id;
}
jsize arrayLength(JNIEnv* env, jbyteArray array) {
    need(array != nullptr, "Missing JNI byte array");
    return env->GetArrayLength(array);
}
void copyIn(JNIEnv* env, jbyteArray array, unsigned char* target, size_t count) {
    env->GetByteArrayRegion(array, 0, static_cast<jsize>(count), reinterpret_cast<jbyte*>(target));
    need(!env->ExceptionCheck(), "JNI input transfer failed");
}
void copyOut(JNIEnv* env, jbyteArray array, const unsigned char* bytes, size_t count) {
    env->SetByteArrayRegion(array, 0, static_cast<jsize>(count), reinterpret_cast<const jbyte*>(bytes));
    need(!env->ExceptionCheck(), "JNI output transfer failed");
}
void derive(JNIEnv* env, jbyteArray recovery, const unsigned char* salt, Key& key) {
    need(arrayLength(env, recovery) == 32, "Recovery root must be exactly 32 bytes");
    Key root, prk;
    copyIn(env, recovery, root.data(), 32);
    need(crypto_kdf_hkdf_sha256_extract(prk.data(), salt, 32, root.data(), 32) == 0, "HKDF extract failed");
    need(crypto_kdf_hkdf_sha256_expand(key.data(), 32, INFO, sizeof(INFO) - 1, prk.data()) == 0, "HKDF expand failed");
}
void validateHeader(const unsigned char* h) {
    need(std::memcmp(h, MAGIC, 8) == 0 && h[8] == 0 && h[9] == 4 &&
         h[10] == 0 && h[11] == 0x10 && h[12] == 0 && h[13] == 0,
         "Unsupported binary frame header");
}
void u64(unsigned char* out, uint64_t n) { for (int i = 7; i >= 0; --i) { out[i] = static_cast<unsigned char>(n & 255); n >>= 8; } }
std::array<unsigned char, 115> aad(const State& state, uint64_t sequence, uint64_t length) {
    std::array<unsigned char, 115> result{};
    std::memcpy(result.data(), DOMAIN, sizeof(DOMAIN));
    std::memcpy(result.data() + sizeof(DOMAIN), state.header.data(), HEADER);
    u64(result.data() + 99, sequence); u64(result.data() + 107, length);
    return result;
}
void admit(State& state, uint64_t sequence, size_t encrypted) {
    need(sequence == state.sequence && sequence < MAX_FRAMES, "Invalid frame sequence");
    need(encrypted >= OVERHEAD + 1 && encrypted <= CHUNK + OVERHEAD, "Invalid frame length");
    need(state.plain <= MAX_PLAIN - (encrypted - OVERHEAD), "Plaintext frame capacity exceeded");
    need(state.wire <= MAX_WIRE - 16 - encrypted, "Wire frame capacity exceeded");
}
void advance(State& state, size_t encrypted) {
    state.sequence++; state.plain += encrypted - OVERHEAD; state.wire += 16 + encrypted;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_initPush(JNIEnv* env, jclass, jbyteArray root) {
    return guarded<jlong>(env, 0, 0, [&] {
        need(arrayLength(env, root) == 32, "Recovery root must be exactly 32 bytes");
        auto state = std::make_unique<State>(true);
        std::memcpy(state->header.data(), MAGIC, 8);
        state->header[9] = 4; state->header[11] = 0x10;
        randombytes_buf(state->header.data() + 14, 32);
        Key key; derive(env, root, state->header.data() + 14, key);
        need(crypto_secretstream_xchacha20poly1305_init_push(&state->stream, state->header.data() + 46, key.data()) == 0, "Stream initialization failed");
        return registerState(std::move(state));
    });
}
extern "C" JNIEXPORT jlong JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_initPull(JNIEnv* env, jclass, jbyteArray root, jbyteArray header) {
    return guarded<jlong>(env, 0, 0, [&] {
        need(arrayLength(env, root) == 32 && arrayLength(env, header) == static_cast<jsize>(HEADER), "Invalid root/header length");
        auto state = std::make_unique<State>(false);
        copyIn(env, header, state->header.data(), HEADER); validateHeader(state->header.data());
        Key key; derive(env, root, state->header.data() + 14, key);
        need(crypto_secretstream_xchacha20poly1305_init_pull(&state->stream, state->header.data() + 46, key.data()) == 0, "Stream initialization failed");
        return registerState(std::move(state));
    });
}
extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_header(JNIEnv* env, jclass, jlong id) {
    return guarded<jbyteArray>(env, id, nullptr, [&] {
        State& state = get(id, true);
        auto result = env->NewByteArray(HEADER);
        need(result != nullptr, "JNI header allocation failed");
        copyOut(env, result, state.header.data(), HEADER); return result;
    });
}
extern "C" JNIEXPORT jint JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_push(JNIEnv* env, jclass, jlong id, jbyteArray plain, jint length, jboolean final, jbyteArray ciphertext) {
    return guarded<jint>(env, id, 0, [&] {
        State& state = get(id, true);
        need(length > 0 && length <= static_cast<jint>(CHUNK), "Invalid plaintext frame length");
        need(final || length == static_cast<jint>(CHUNK), "MESSAGE must be a full chunk");
        need(arrayLength(env, plain) >= length && arrayLength(env, plain) <= static_cast<jint>(CHUNK), "Invalid plaintext buffer");
        const size_t encrypted = static_cast<size_t>(length) + OVERHEAD;
        need(arrayLength(env, ciphertext) >= static_cast<jsize>(encrypted) && arrayLength(env, ciphertext) <= static_cast<jint>(CHUNK + OVERHEAD), "Invalid ciphertext buffer");
        admit(state, state.sequence, encrypted);
        Bytes input(length), output(encrypted); copyIn(env, plain, input.data(), length);
        auto associated = aad(state, state.sequence, encrypted);
        unsigned long long actual = 0;
        need(crypto_secretstream_xchacha20poly1305_push(&state.stream, output.data(), &actual, input.data(), length,
             associated.data(), associated.size(), final ? 3 : 0) == 0 && actual == encrypted, "Frame encryption failed");
        copyOut(env, ciphertext, output.data(), encrypted); advance(state, encrypted);
        if (final) states.erase(id);
        return static_cast<jint>(encrypted);
    });
}
extern "C" JNIEXPORT jlong JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_pull(JNIEnv* env, jclass, jlong id, jlong sequence, jlong declared, jbyteArray ciphertext, jbyteArray plain) {
    return guarded<jlong>(env, id, 0, [&] {
        State& state = get(id, false);
        need(sequence >= 0 && declared >= 18 && declared <= static_cast<jlong>(CHUNK + OVERHEAD), "Invalid unsigned frame header");
        const size_t encrypted = static_cast<size_t>(declared);
        admit(state, static_cast<uint64_t>(sequence), encrypted);
        need(arrayLength(env, ciphertext) >= declared && arrayLength(env, ciphertext) <= static_cast<jint>(CHUNK + OVERHEAD), "Invalid ciphertext buffer");
        need(arrayLength(env, plain) >= static_cast<jsize>(encrypted - OVERHEAD) && arrayLength(env, plain) <= static_cast<jint>(CHUNK), "Invalid plaintext buffer");
        Bytes input(encrypted), output(encrypted - OVERHEAD); copyIn(env, ciphertext, input.data(), encrypted);
        auto associated = aad(state, static_cast<uint64_t>(sequence), encrypted);
        unsigned long long actual = 0; unsigned char tag = 0xff;
        need(crypto_secretstream_xchacha20poly1305_pull(&state.stream, output.data(), &actual, &tag,
             input.data(), encrypted, associated.data(), associated.size()) == 0, "Frame authentication failed");
        need(actual == encrypted - OVERHEAD && (tag == 0 || tag == 3), "Unsupported authenticated frame tag/length");
        need(tag == 3 || actual == CHUNK, "MESSAGE must be a full chunk");
        // Authentication AND application tag/length admission precede JNI plaintext release.
        copyOut(env, plain, output.data(), actual); advance(state, encrypted);
        if (tag == 3) states.erase(id);
        return (static_cast<jlong>(tag) << 32) | static_cast<jlong>(actual);
    });
}
extern "C" JNIEXPORT jboolean JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_close(JNIEnv*, jclass, jlong id) {
    std::lock_guard<std::mutex> guard(registryMutex);
    return states.erase(id) != 0;
}
extern "C" JNIEXPORT jint JNICALL
Java_ca_penny_v4frameprobe_NativeFrames_activeHandlesForTests(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> guard(registryMutex);
    return static_cast<jint>(states.size());
}
