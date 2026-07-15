import type { ChangeKind, ChangeStatus, ProposedChange, RegistryChange } from '../types';

/**
 * Minimal structural subset of ProseMirror's `Mappable` (a `Mapping` or
 * `StepMap`). Kept local so the registry has zero editor dependencies and
 * stays trivially unit-testable.
 */
export interface Mappable {
  map(pos: number, assoc?: number): number;
}

type Listener = () => void;

interface HistoryEntry {
  id: string;
  prev: ChangeStatus;
  next: ChangeStatus;
}

function kindOf(c: ProposedChange): ChangeKind {
  const hasDel = !!c.deletion && c.deletion.length > 0;
  const hasIns = !!c.insertion && c.insertion.length > 0;
  if (hasDel && hasIns) return 'replacement';
  if (hasIns) return 'insertion';
  return 'deletion';
}

/**
 * Holds the set of proposed changes and their resolution state. The registry
 * is the single source of truth for the review UI; the editor integration
 * mirrors accept/reject into actual document mutations.
 *
 * All position bookkeeping goes through {@link remap}, so cards and spotlights
 * stay attached to the right text as the document is edited.
 */
export class ChangeRegistry {
  private changes = new Map<string, RegistryChange>();
  private order: string[] = [];
  private history: HistoryEntry[] = [];
  private listeners = new Set<Listener>();
  /** Cached, referentially-stable snapshot for useSyncExternalStore. */
  private snap: RegistryChange[] = [];

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.snap = this.order.map((id) => this.changes.get(id)!).filter(Boolean);
    for (const fn of this.listeners) fn();
  }

  /** Insert (or replace) a proposed change, initialising its live position. */
  add(change: ProposedChange): RegistryChange {
    const entry: RegistryChange = {
      ...change,
      kind: kindOf(change),
      status: 'pending',
      live: { from: change.anchor.from, to: change.anchor.to },
    };
    if (!this.changes.has(change.id)) this.order.push(change.id);
    this.changes.set(change.id, entry);
    this.emit();
    return entry;
  }

  get(id: string): RegistryChange | undefined {
    return this.changes.get(id);
  }

  /** All changes in insertion order (referentially stable between mutations). */
  all(): RegistryChange[] {
    return this.snap;
  }

  pending(): RegistryChange[] {
    return this.all().filter((c) => c.status === 'pending');
  }

  counts(): { pending: number; accepted: number; rejected: number; total: number } {
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    for (const c of this.changes.values()) {
      if (c.status === 'pending') pending++;
      else if (c.status === 'accepted') accepted++;
      else rejected++;
    }
    return { pending, accepted, rejected, total: this.changes.size };
  }

  private setStatus(id: string, next: ChangeStatus, record: boolean): boolean {
    const c = this.changes.get(id);
    if (!c || c.status === next) return false;
    if (record) this.history.push({ id, prev: c.status, next });
    c.status = next;
    this.emit();
    return true;
  }

  accept(id: string): boolean {
    return this.setStatus(id, 'accepted', true);
  }

  reject(id: string): boolean {
    return this.setStatus(id, 'rejected', true);
  }

  /** Resolve every still-pending change; returns the affected ids. */
  acceptAll(): string[] {
    return this.resolveAllPending('accepted');
  }

  rejectAll(): string[] {
    return this.resolveAllPending('rejected');
  }

  private resolveAllPending(next: ChangeStatus): string[] {
    const ids: string[] = [];
    for (const id of this.order) {
      const c = this.changes.get(id);
      if (c && c.status === 'pending') {
        this.history.push({ id, prev: c.status, next });
        c.status = next;
        ids.push(id);
      }
    }
    if (ids.length) this.emit();
    return ids;
  }

  /** Undo the most recent accept/reject. Returns the reverted change id. */
  undo(): string | null {
    const entry = this.history.pop();
    if (!entry) return null;
    const c = this.changes.get(entry.id);
    if (!c) return null;
    c.status = entry.prev;
    this.emit();
    return entry.id;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * Remap every live position through a document change. Changes whose anchor
   * collapses to zero-width after mapping are left as-is (assoc keeps them
   * attached to the surrounding text).
   */
  remap(mapping: Mappable): void {
    for (const c of this.changes.values()) {
      c.live = {
        from: mapping.map(c.live.from, -1),
        to: mapping.map(c.live.to, 1),
      };
    }
    // No emit: positions feed layout, which recomputes on the same frame.
  }

  /** Ordered navigation helper: next pending id after the given one (wraps). */
  nextPending(afterId: string | null): string | null {
    const pend = this.pending();
    if (pend.length === 0) return null;
    if (!afterId) return pend[0]!.id;
    const idx = pend.findIndex((c) => c.id === afterId);
    return pend[(idx + 1) % pend.length]!.id;
  }

  prevPending(beforeId: string | null): string | null {
    const pend = this.pending();
    if (pend.length === 0) return null;
    if (!beforeId) return pend[pend.length - 1]!.id;
    const idx = pend.findIndex((c) => c.id === beforeId);
    return pend[(idx - 1 + pend.length) % pend.length]!.id;
  }

  clear(): void {
    this.changes.clear();
    this.order = [];
    this.history = [];
    this.emit();
  }
}
