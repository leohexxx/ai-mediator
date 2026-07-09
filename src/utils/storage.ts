import { openDB, type IDBPDatabase } from 'idb';
import type { Case } from '../types';

const DB_NAME = 'ai-mediator';
const DB_VERSION = 1;

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('cases')) {
        const store = database.createObjectStore('cases', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    },
  });
  return db;
}

export async function saveCase(c: Case): Promise<void> {
  const database = await getDB();
  await database.put('cases', { ...c, updatedAt: new Date().toISOString() });
}

export async function getCase(id: string): Promise<Case | undefined> {
  const database = await getDB();
  return database.get('cases', id);
}

export async function getAllCases(): Promise<Case[]> {
  const database = await getDB();
  const cases = await database.getAll('cases');
  return cases.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteCase(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('cases', id);
}
