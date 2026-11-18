import type { Spin, SpinDraft, SpinSource, StatDistribution, StatRow } from './types';

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const DB_NAME = 'spinwise-local-history';
const STORE_NAME = 'spins';
const POCKET_COUNT = 37;

export function pocketColor(pocket: number): 'red' | 'black' | 'green' {
  if (pocket === 0) return 'green';
  return RED_NUMBERS.has(pocket) ? 'red' : 'black';
}

export function parity(pocket: number): 'zero' | 'even' | 'odd' {
  return pocket === 0 ? 'zero' : pocket % 2 === 0 ? 'even' : 'odd';
}

export function dozen(pocket: number): string {
  if (pocket === 0) return '—';
  const ordinal = ['1st', '2nd', '3rd'][Math.floor((pocket - 1) / 12)];
  return `${ordinal} dozen`;
}

export function column(pocket: number): string {
  return pocket === 0 ? '—' : `column ${((pocket - 1) % 3) + 1}`;
}

export function pocketLabel(pocket: number): string {
  return `${pocketColor(pocket)} · ${parity(pocket)} · ${dozen(pocket)} · ${column(pocket)}`;
}

export function securePocket(): number {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure browser randomness is unavailable in this context. Open the app over HTTPS or localhost.');
  }
  // Rejection sampling prevents modulo bias when mapping 32-bit crypto values to 37 pockets.
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / POCKET_COUNT) * POCKET_COUNT;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % POCKET_COUNT;
}

export function currentSessionId(): string {
  const storageKey = 'spinwise-session-id';
  let id = sessionStorage.getItem(storageKey);
  if (!id) {
    const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
    id = `${new Date().toISOString().slice(0, 10)}-${suffix}`;
    sessionStorage.setItem(storageKey, id);
  }
  return id;
}

export function makeSpinDraft(pocket: number, source: SpinSource, sessionId = currentSessionId(), createdAt = new Date().toISOString()): SpinDraft {
  if (!Number.isInteger(pocket) || pocket < 0 || pocket > 36) throw new RangeError('Pocket must be an integer from 0 to 36.');
  return { pocket, source, sessionId, createdAt };
}

let dbPromise: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser does not support local IndexedDB storage.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('sessionId', 'sessionId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local history.'));
    });
  }
  return dbPromise;
}

export async function listSpins(): Promise<Spin[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as Spin[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error ?? new Error('Could not load spin history.'));
  });
}

export async function addSpin(draft: SpinDraft): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save spin.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Spin save was cancelled.'));
  });
}

export async function addSpins(drafts: SpinDraft[]): Promise<void> {
  if (!drafts.length) return;
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const draft of drafts) store.add(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not import spin history.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Import was cancelled.'));
  });
}

export async function updateSpin(spin: Spin): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(spin);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update spin.'));
  });
}

export async function deleteSpin(id: number): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete spin.'));
  });
}

export async function clearHistory(): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear history.'));
  });
}

interface GroupSpec { label: string; probability: number; matches: (spin: Spin) => boolean }
const numberGroups: GroupSpec[] = Array.from({ length: POCKET_COUNT }, (_, pocket) => ({
  label: String(pocket), probability: 1 / POCKET_COUNT, matches: (spin) => spin.pocket === pocket,
}));
const colorGroups: GroupSpec[] = [
  { label: 'Green', probability: 1 / 37, matches: (s) => s.pocket === 0 },
  { label: 'Red', probability: 18 / 37, matches: (s) => pocketColor(s.pocket) === 'red' },
  { label: 'Black', probability: 18 / 37, matches: (s) => pocketColor(s.pocket) === 'black' },
];
const parityGroups: GroupSpec[] = [
  { label: 'Zero', probability: 1 / 37, matches: (s) => s.pocket === 0 },
  { label: 'Even', probability: 18 / 37, matches: (s) => s.pocket !== 0 && s.pocket % 2 === 0 },
  { label: 'Odd', probability: 18 / 37, matches: (s) => s.pocket % 2 === 1 },
];
const dozenGroups: GroupSpec[] = [
  { label: 'Zero', probability: 1 / 37, matches: (s) => s.pocket === 0 },
  ...[1, 2, 3].map((d) => ({ label: `${['1st', '2nd', '3rd'][d - 1]} dozen`, probability: 12 / 37, matches: (s: Spin) => s.pocket !== 0 && Math.floor((s.pocket - 1) / 12) + 1 === d })),
];
const columnGroups: GroupSpec[] = [
  { label: 'Zero', probability: 1 / 37, matches: (s) => s.pocket === 0 },
  ...[1, 2, 3].map((c) => ({ label: `Column ${c}`, probability: 12 / 37, matches: (s: Spin) => s.pocket !== 0 && ((s.pocket - 1) % 3) + 1 === c })),
];

function approximateCritical95(df: number): number {
  const z = 1.6448536269514722;
  return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
}

function makeDistribution(name: string, spins: Spin[], specs: GroupSpec[]): StatDistribution {
  const rows: StatRow[] = specs.map((spec) => {
    const count = spins.reduce((sum, spin) => sum + Number(spec.matches(spin)), 0);
    return { label: spec.label, count, expected: spins.length * spec.probability, probability: spec.probability };
  });
  const eligible = spins.length > 0 && rows.every((row) => row.expected >= 5);
  const chiSquare = eligible ? rows.reduce((sum, row) => sum + ((row.count - row.expected) ** 2 / row.expected), 0) : null;
  const degreesOfFreedom = rows.length - 1;
  const critical95 = eligible ? approximateCritical95(degreesOfFreedom) : null;
  return { name, rows, eligible, chiSquare, critical95, degreesOfFreedom, sampleSize: spins.length };
}

export function analyzeDistributions(spins: Spin[]): StatDistribution[] {
  return [
    makeDistribution('Pocket', spins, numberGroups),
    makeDistribution('Color', spins, colorGroups),
    makeDistribution('Parity', spins, parityGroups),
    makeDistribution('Dozen', spins, dozenGroups),
    makeDistribution('Column', spins, columnGroups),
  ];
}

export interface PatternSummary {
  repeatCount: number;
  longestColorRun: { color: string; length: number };
  droughts: { pocket: number; gap: number }[];
  recentSequence: Spin[];
  categoryTraces: { label: string; values: string[] }[];
}

export function analyzePatterns(spins: Spin[]): PatternSummary {
  const ordered = [...spins].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let repeatCount = 0;
  for (let i = 1; i < ordered.length; i += 1) if (ordered[i].pocket === ordered[i - 1].pocket) repeatCount += 1;

  let longestColorRun = { color: '—', length: 0 };
  let runColor = '';
  let runLength = 0;
  for (const spin of ordered) {
    const color = pocketColor(spin.pocket);
    if (color === 'green') {
      runColor = '';
      runLength = 0;
    } else if (color === runColor) {
      runLength += 1;
    } else {
      runColor = color;
      runLength = 1;
    }
    if (runLength > longestColorRun.length) longestColorRun = { color, length: runLength };
  }

  const lastSeen = new Array<number>(POCKET_COUNT).fill(-1);
  ordered.forEach((spin, index) => { lastSeen[spin.pocket] = index; });
  const droughts = lastSeen.map((lastIndex, pocket) => ({ pocket, gap: lastIndex < 0 ? ordered.length : ordered.length - lastIndex - 1 }))
    .sort((a, b) => b.gap - a.gap || a.pocket - b.pocket).slice(0, 4);
  const recentSequence = ordered.slice(-18).reverse();
  const categorySample = recentSequence.slice(0, 8);
  const categoryTraces = [
    { label: 'COLOR', values: categorySample.map((spin) => pocketColor(spin.pocket) === 'green' ? '0' : pocketColor(spin.pocket) === 'red' ? 'R' : 'B') },
    { label: 'PARITY', values: categorySample.map((spin) => spin.pocket === 0 ? '0' : spin.pocket % 2 === 0 ? 'E' : 'O') },
    { label: 'DOZEN', values: categorySample.map((spin) => spin.pocket === 0 ? '0' : String(Math.floor((spin.pocket - 1) / 12) + 1)) },
    { label: 'COLUMN', values: categorySample.map((spin) => spin.pocket === 0 ? '0' : String(((spin.pocket - 1) % 3) + 1)) },
  ];

  return { repeatCount, longestColorRun, droughts, recentSequence, categoryTraces };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseHistoricalCsv(text: string): { drafts: SpinDraft[]; skipped: number } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) throw new Error('The CSV file is empty.');
  const first = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const headerNames = ['pocket', 'number', 'result', 'outcome'];
  const pocketColumn = first.findIndex((cell) => headerNames.includes(cell));
  const timeColumn = first.findIndex((cell) => ['timestamp', 'date', 'time', 'datetime'].includes(cell));
  const hasHeader = pocketColumn >= 0;
  const start = hasHeader ? 1 : 0;
  const numberIndex = hasHeader ? pocketColumn : 0;
  const dateIndex = hasHeader ? timeColumn : -1;
  const batch = `import-${new Date().toISOString().slice(0, 10)}-${globalThis.crypto?.randomUUID?.().slice(0, 6) ?? Date.now()}`;
  const drafts: SpinDraft[] = [];
  let skipped = 0;

  for (let i = start; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    let raw = cells[numberIndex] ?? '';
    if (!hasHeader) raw = cells.find((cell) => /^\d{1,2}$/.test(cell)) ?? raw;
    const pocket = Number(raw);
    if (!/^\d{1,2}$/.test(raw) || !Number.isInteger(pocket) || pocket < 0 || pocket > 36) { skipped += 1; continue; }
    const parsedDate = dateIndex >= 0 ? new Date(cells[dateIndex] ?? '') : new Date();
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    drafts.push(makeSpinDraft(pocket, 'imported', `${batch}-${date.toISOString().slice(0, 10)}`, date.toISOString()));
  }
  if (!drafts.length) throw new Error('No valid pocket values found. Provide integers from 0 to 36 in a pocket, number, result, or outcome column.');
  return { drafts, skipped };
}

export function serializeCsv(spins: Spin[]): string {
  const rows = ['pocket,color,parity,dozen,column,timestamp,source,session_id'];
  for (const spin of spins) {
    rows.push([spin.pocket, pocketColor(spin.pocket), parity(spin.pocket), dozen(spin.pocket), column(spin.pocket), spin.createdAt, spin.source, spin.sessionId].join(','));
  }
  return rows.join('\n');
}
