#include "LocalReceiptFileProtection.h"
#include <fcntl.h>
#include <sys/stat.h>
#include <TargetConditionals.h>

/* Class A (1) is Apple's complete protection class. A fixed C boundary is
 * required because Swift cannot import openat_dprotected_np's variadic mode. */
int penny_open_receipt_protected_at(int directory_fd, const char *name) {
#if TARGET_OS_SIMULATOR
    /* Build-time filesystem test implementation, never a failure fallback.
     * This branch provides no Apple data-protection class. */
    return openat(directory_fd, name,
        O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
        S_IRUSR | S_IWUSR);
#else
    return openat_dprotected_np(directory_fd, name,
        O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
        1, 0, S_IRUSR | S_IWUSR);
#endif
}

int penny_receipt_protection_class(int file_fd) {
    return fcntl(file_fd, F_GETPROTECTIONCLASS);
}
