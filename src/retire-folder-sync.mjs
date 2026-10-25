/**
 * Retire old automatic folder-sync permissions without deleting a single file.
 * Existing device-*.remo.zip copies remain available for manual backup import.
 * The legacy connection is stored in an account-scoped IndexedDB database.
 */
export const legacyFolderDatabaseName = accountKey =>
  accountKey === 'remo-web' ? 'remo-folder-access' : 'remo-folder-access-' + accountKey;

export async function retireLegacyFolderSync(accountKey) {
  if (typeof indexedDB === 'undefined') return false;
  const name = legacyFolderDatabaseName(accountKey);
  // Avoid creating legacy databases for new installations where supported.
  if (typeof indexedDB.databases === 'function') {
    try {
      const existing = await indexedDB.databases();
      if (!existing.some(database => database.name === name)) return false;
    } catch { /* Older browsers may not support database enumeration. */ }
  }
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains('settings')) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').delete('connection');
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    return true;
  } finally {
    db.close();
  }
}
