/**
 * UserIdentityStore - Persists the authenticated user's identity
 * using IndexedDB, which survives browser cache clears.
 *
 * Flow:
 * 1. First connection: backend returns authenticatedUser → stored here
 * 2. Subsequent visits: recalled automatically, even after cache clear
 * 3. Different user connects: identity is updated
 */

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

interface StoredIdentity {
  email: string;
  name: string;
  id?: string | undefined;
  avatarUrl?: string | undefined;
  adapter: string;
  lastSeen: string;
}

const DB_NAME = 'traklet';
const STORE_NAME = 'identity';
const KEY = 'current-user';

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Save the authenticated user identity.
 * Called after a successful backend connection.
 */
export async function saveUserIdentity(
  identity: { email: string; name: string; id?: string | undefined; avatarUrl?: string | undefined },
  adapter: string
): Promise<void> {
  try {
    const db = await getDb();
    const stored: StoredIdentity = {
      ...identity,
      adapter,
      lastSeen: new Date().toISOString(),
    };
    await db.put(STORE_NAME, stored, KEY);
  } catch {
    // IndexedDB not available (e.g., private browsing in some browsers)
    // Fall back to localStorage
    try {
      localStorage.setItem('__traklet_user_identity__', JSON.stringify({
        ...identity,
        adapter,
        lastSeen: new Date().toISOString(),
      }));
    } catch { /* give up */ }
  }
}

/**
 * Recall the last authenticated user.
 * Returns null if no identity has been stored.
 */
export async function recallUserIdentity(): Promise<StoredIdentity | null> {
  try {
    const db = await getDb();
    const stored = await db.get(STORE_NAME, KEY) as StoredIdentity | undefined;
    if (stored) return stored;
  } catch {
    // IndexedDB not available
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem('__traklet_user_identity__');
    if (raw) return JSON.parse(raw) as StoredIdentity;
  } catch { /* give up */ }

  return null;
}

/**
 * Clear stored identity (logout).
 */
export async function clearUserIdentity(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, KEY);
  } catch { /* ignore */ }
  try {
    localStorage.removeItem('__traklet_user_identity__');
  } catch { /* ignore */ }
}
