import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { DEFAULT_ROUTER_CARTRIDGE } from '../fixtures/defaultRouterCartridge';
import {
  CartridgeStep,
  CartridgeVersionSnapshot,
  EscalationStatus,
  OfflineEscalationItem,
  VisualCartridge
} from '../types/cartridge';
import {
  applyAuditToCartridge,
  incrementMinorVersion
} from './compilerAudit';

const DB_NAME = 'pokayoke-studio-db';
const DB_VERSION = 1;

interface PokaYokeDBSchema extends DBSchema {
  cartridges: {
    key: string;
    value: VisualCartridge;
    indexes: {
      'by-updatedAt': string;
    };
  };
  cartridgeVersions: {
    key: string;
    value: CartridgeVersionSnapshot;
    indexes: {
      'by-cartridgeId': string;
    };
  };
  escalations: {
    key: string;
    value: OfflineEscalationItem;
    indexes: {
      'by-cartridgeId': string;
      'by-status': EscalationStatus;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PokaYokeDBSchema>> | null = null;

function getDatabase(): Promise<IDBPDatabase<PokaYokeDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<PokaYokeDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cartridges')) {
          const store = db.createObjectStore('cartridges', { keyPath: 'id' });
          store.createIndex('by-updatedAt', 'updatedAt');
        }

        if (!db.objectStoreNames.contains('cartridgeVersions')) {
          const versionStore = db.createObjectStore('cartridgeVersions', {
            keyPath: 'key'
          });
          versionStore.createIndex('by-cartridgeId', 'cartridgeId');
        }

        if (!db.objectStoreNames.contains('escalations')) {
          const escalationStore = db.createObjectStore('escalations', {
            keyPath: 'id'
          });
          escalationStore.createIndex('by-cartridgeId', 'cartridgeId');
          escalationStore.createIndex('by-status', 'status');
        }
      }
    });
  }
  return dbPromise;
}

export async function seedDefaultCartridgeIfEmpty(): Promise<VisualCartridge[]> {
  const db = await getDatabase();
  const existing = await db.getAll('cartridges');

  if (existing.length === 0) {
    await saveCartridge(DEFAULT_ROUTER_CARTRIDGE, true);
    return [DEFAULT_ROUTER_CARTRIDGE];
  }

  return existing.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listCartridges(): Promise<VisualCartridge[]> {
  const db = await getDatabase();
  const all = await db.getAll('cartridges');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCartridge(id: string): Promise<VisualCartridge | undefined> {
  const db = await getDatabase();
  return db.get('cartridges', id);
}

export async function saveCartridge(
  cartridge: VisualCartridge,
  saveVersionSnapshot = true
): Promise<VisualCartridge> {
  const db = await getDatabase();
  const timestamped: VisualCartridge = {
    ...cartridge,
    updatedAt: new Date().toISOString()
  };

  await db.put('cartridges', timestamped);

  if (saveVersionSnapshot) {
    const snapshot: CartridgeVersionSnapshot = {
      key: `${timestamped.id}@${timestamped.version}`,
      cartridgeId: timestamped.id,
      version: timestamped.version,
      savedAt: timestamped.updatedAt,
      snapshot: timestamped
    };
    await db.put('cartridgeVersions', snapshot);
  }

  return timestamped;
}

export async function deleteCartridge(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('cartridges', id);

  const versions = await db.getAllFromIndex('cartridgeVersions', 'by-cartridgeId', id);
  const tx = db.transaction('cartridgeVersions', 'readwrite');
  for (const version of versions) {
    await tx.store.delete(version.key);
  }
  await tx.done;
}

export async function listCartridgeVersions(
  cartridgeId: string
): Promise<CartridgeVersionSnapshot[]> {
  const db = await getDatabase();
  const versions = await db.getAllFromIndex(
    'cartridgeVersions',
    'by-cartridgeId',
    cartridgeId
  );
  return versions.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function applyPatchedStepToCartridge(params: {
  cartridgeId: string;
  patchedStep: CartridgeStep;
  escalationId: string;
  summary: string;
}): Promise<VisualCartridge> {
  const existing = await getCartridge(params.cartridgeId);
  if (!existing) {
    throw new Error(`Cartridge "${params.cartridgeId}" not found in IndexedDB.`);
  }

  const nextVersion = incrementMinorVersion(existing.version);
  const now = new Date().toISOString();

  const updatedSteps = existing.steps.map((step) =>
    step.id === params.patchedStep.id ? params.patchedStep : step
  );

  const patchedDraft: VisualCartridge = {
    ...existing,
    version: nextVersion,
    updatedAt: now,
    steps: updatedSteps,
    patchHistory: [
      ...existing.patchHistory,
      {
        fromVersion: existing.version,
        toVersion: nextVersion,
        patchedAt: now,
        stepId: params.patchedStep.id,
        escalationId: params.escalationId,
        summary: params.summary
      }
    ]
  };

  const audited = applyAuditToCartridge(patchedDraft);
  return saveCartridge(audited, true);
}

export async function enqueueEscalation(
  item: OfflineEscalationItem
): Promise<OfflineEscalationItem> {
  const db = await getDatabase();
  await db.put('escalations', item);
  return item;
}

export async function listEscalations(
  status?: EscalationStatus
): Promise<OfflineEscalationItem[]> {
  const db = await getDatabase();
  const items = status
    ? await db.getAllFromIndex('escalations', 'by-status', status)
    : await db.getAll('escalations');
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateEscalation(
  item: OfflineEscalationItem
): Promise<OfflineEscalationItem> {
  const db = await getDatabase();
  await db.put('escalations', item);
  return item;
}

export async function deleteEscalation(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('escalations', id);
}

export interface CartridgeExportEnvelope {
  schema: 'pokayoke-studio/cartridge@1';
  exportedAt: string;
  cartridge: VisualCartridge;
}

export function exportCartridgeJson(cartridge: VisualCartridge): string {
  const envelope: CartridgeExportEnvelope = {
    schema: 'pokayoke-studio/cartridge@1',
    exportedAt: new Date().toISOString(),
    cartridge
  };
  return JSON.stringify(envelope, null, 2);
}

function isValidCartridgeShape(value: unknown): value is VisualCartridge {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Partial<VisualCartridge>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.equipmentModel === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.rawManualText === 'string' &&
    Array.isArray(obj.steps)
  );
}

export async function importCartridgeJson(
  jsonText: string
): Promise<VisualCartridge> {
  const parsed: unknown = JSON.parse(jsonText);
  let candidate: unknown = parsed;

  if (parsed && typeof parsed === 'object' && 'cartridge' in parsed) {
    candidate = (parsed as { cartridge: unknown }).cartridge;
  }

  if (!isValidCartridgeShape(candidate)) {
    throw new Error('Invalid PokaYoke Cartridge JSON payload.');
  }

  const normalized: VisualCartridge = {
    ...candidate,
    patchHistory: Array.isArray(candidate.patchHistory) ? candidate.patchHistory : []
  };

  const audited = applyAuditToCartridge(normalized);
  return saveCartridge(audited, true);
}
