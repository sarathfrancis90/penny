#ifndef PENNY_LOCAL_RECEIPT_FILE_PROTECTION_H
#define PENNY_LOCAL_RECEIPT_FILE_PROTECTION_H
int penny_open_receipt_protected_at(int directory_fd, const char *name);
int penny_receipt_protection_class(int file_fd);
#endif
