function assertZipEntrySizes(entries, { maxEntryBytes, maxTotalBytes }) {
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const size = entry.header?.size;
    if (!Number.isSafeInteger(size) || size < 0 || size > maxEntryBytes || size > maxTotalBytes - totalBytes) {
      throw new Error('ZIP contains an entry that exceeds the expanded size limit');
    }
    totalBytes += size;
  }
}

module.exports = { assertZipEntrySizes };
