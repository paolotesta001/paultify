// Ask the browser to mark our IndexedDB as "persistent" so iOS Safari is less
// likely to evict it. iOS only grants this to PWAs added to Home Screen, but
// asking is harmless on every other platform.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
