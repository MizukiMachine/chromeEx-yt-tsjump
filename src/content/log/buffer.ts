/**
 * Fixed-length in-memory log ring buffer for debug panel.
 * Stores recent events with timestamps and notifies subscribers on updates.
 */

export type LogEvent = {
  ts: number;           // epoch ms
  kind: string;         // event kind, e.g. 'seek', 'jump', 'ad', 'status'
  data?: unknown;       // payload (JSON-serializable preferred)
};

const CAPACITY = 200;
const buf: LogEvent[] = new Array(CAPACITY);
let size = 0;
let head = 0; // next write index

type Listener = () => void;
const listeners = new Set<Listener>();
let scheduled = false;

function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) {
      try { l(); } catch {}
    }
  });
}

export function log(kind: string, data?: unknown): void {
  const e: LogEvent = { ts: Date.now(), kind, data };
  buf[head] = e;
  head = (head + 1) % CAPACITY;
  if (size < CAPACITY) size++;
  notify();
}

export function clear(): void {
  size = 0;
  head = 0;
  notify();
}

/** Return events in chronological order (oldest → newest). */
export function getAll(): LogEvent[] {
  const out: LogEvent[] = [];
  for (let i = 0; i < size; i++) {
    const idx = (head - size + i + CAPACITY) % CAPACITY;
    const e = buf[idx];
    if (e) out.push(e);
  }
  return out;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

