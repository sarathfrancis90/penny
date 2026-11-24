import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Small in-memory stand-in for the Firestore Admin SDK, for service tests.
 * Supports the subset the API services use: documents, sub-collections,
 * equality/range queries, batches (with the real 500-write limit) and
 * transactions that apply their writes only when the callback succeeds.
 */

type Data = Record<string, unknown>;
type WhereOp = '==' | 'in' | '<' | '<=' | '>' | '>=';

function isPlainObject(value: unknown): value is Data {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Timestamp) &&
    !(value instanceof FieldValue)
  );
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as unknown as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}

function applyValue(target: Data, key: string, value: unknown) {
  if (value instanceof FieldValue) {
    if (value.isEqual(FieldValue.delete())) {
      delete target[key];
      return;
    }
    const transform = value as unknown as {
      operand?: number;
      elements?: unknown[];
    };
    if (typeof transform.operand === 'number') {
      const current = typeof target[key] === 'number' ? (target[key] as number) : 0;
      target[key] = current + transform.operand;
      return;
    }
    if (Array.isArray(transform.elements)) {
      const current = Array.isArray(target[key]) ? (target[key] as unknown[]) : [];
      target[key] = [...current, ...transform.elements];
      return;
    }
    throw new Error('Unsupported FieldValue in fake Firestore');
  }
  target[key] = clone(value);
}

function mergeInto(target: Data, source: Data) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      mergeInto(target[key] as Data, value);
    } else {
      applyValue(target, key, value);
    }
  }
}

function applyUpdate(target: Data, updates: Data) {
  for (const [path, value] of Object.entries(updates)) {
    const segments = path.split('.');
    let cursor = target;
    for (const segment of segments.slice(0, -1)) {
      if (!isPlainObject(cursor[segment])) cursor[segment] = {};
      cursor = cursor[segment] as Data;
    }
    applyValue(cursor, segments[segments.length - 1], value);
  }
}

function readField(data: Data, path: string): unknown {
  let cursor: unknown = data;
  for (const segment of path.split('.')) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function comparable(value: unknown): number | string | boolean | null | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function matches(actual: unknown, op: WhereOp, expected: unknown): boolean {
  if (op === 'in') {
    return (
      Array.isArray(expected) &&
      expected.some((entry) => comparable(entry) === comparable(actual))
    );
  }
  const left = comparable(actual);
  const right = comparable(expected);
  if (op === '==') return left === right;
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  if (op === '<') return left < right;
  if (op === '<=') return left <= right;
  if (op === '>') return left > right;
  return left >= right;
}

export function notFoundError() {
  return Object.assign(new Error('5 NOT_FOUND: No document to update'), { code: 5 });
}

export function alreadyExistsError() {
  return Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), {
    code: 6,
  });
}

export class FakeDocSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly stored: Data | undefined,
  ) {}

  get id() {
    return this.ref.id;
  }

  get exists() {
    return this.stored !== undefined;
  }

  data(): Data | undefined {
    return this.stored === undefined ? undefined : clone(this.stored);
  }
}

export class FakeDocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split('/').pop() ?? '';
  }

  collection(name: string) {
    return new FakeCollection(this.store, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocSnapshot(this, this.store.docs.get(this.path));
  }

  async set(data: Data, options?: { merge?: boolean }) {
    this.store.applySet(this.path, data, options);
  }

  async create(data: Data) {
    if (this.store.docs.has(this.path)) throw alreadyExistsError();
    this.store.applySet(this.path, data);
  }

  async update(data: Data) {
    this.store.applyUpdate(this.path, data);
  }

  async delete() {
    this.store.docs.delete(this.path);
  }
}

class FakeQuery {
  constructor(
    protected readonly store: FakeFirestore,
    protected readonly collectionPath: string,
    private readonly filters: Array<[string, WhereOp, unknown]> = [],
    private readonly order?: { field: string; direction: 'asc' | 'desc' },
    private readonly max?: number,
    private readonly after?: string,
  ) {}

  where(field: string, op: WhereOp, value: unknown) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      [...this.filters, [field, op, value]],
      this.order,
      this.max,
      this.after,
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      this.filters,
      { field, direction },
      this.max,
      this.after,
    );
  }

  limit(max: number) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      this.filters,
      this.order,
      max,
      this.after,
    );
  }

  startAfter(snapshot: FakeDocSnapshot) {
    return new FakeQuery(
      this.store,
      this.collectionPath,
      this.filters,
      this.order,
      this.max,
      snapshot.ref.path,
    );
  }

  async get() {
    this.store.queries.push({
      collection: this.collectionPath,
      filters: this.filters.map(([field]) => field),
    });
    const depth = this.collectionPath.split('/').length + 1;
    let rows = [...this.store.docs.entries()].filter(
      ([path, data]) =>
        path.startsWith(`${this.collectionPath}/`) &&
        path.split('/').length === depth &&
        this.filters.every(([field, op, value]) =>
          matches(readField(data, field), op, value),
        ),
    );
    if (this.order) {
      const { field, direction } = this.order;
      rows = rows.sort(([, a], [, b]) => {
        const left = comparable(readField(a, field)) ?? 0;
        const right = comparable(readField(b, field)) ?? 0;
        const result = left < right ? -1 : left > right ? 1 : 0;
        return direction === 'desc' ? -result : result;
      });
    }
    if (this.after) {
      const index = rows.findIndex(([path]) => path === this.after);
      rows = rows.slice(index + 1);
    }
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    const docs = rows.map(
      ([path, data]) => new FakeDocSnapshot(new FakeDocRef(this.store, path), data),
    );
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class FakeCollection extends FakeQuery {
  constructor(store: FakeFirestore, path: string) {
    super(store, path);
  }

  doc(id?: string) {
    return new FakeDocRef(
      this.store,
      `${this.collectionPath}/${id ?? this.store.nextId()}`,
    );
  }

  async add(data: Data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

type PendingWrite = () => void;

class FakeWriteBuffer {
  protected readonly writes: PendingWrite[] = [];

  constructor(protected readonly store: FakeFirestore) {}

  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }) {
    this.writes.push(() => this.store.applySet(ref.path, data, options));
    return this;
  }

  create(ref: FakeDocRef, data: Data) {
    this.writes.push(() => {
      if (this.store.docs.has(ref.path)) throw alreadyExistsError();
      this.store.applySet(ref.path, data);
    });
    return this;
  }

  update(ref: FakeDocRef, data: Data) {
    this.writes.push(() => this.store.applyUpdate(ref.path, data));
    return this;
  }

  delete(ref: FakeDocRef) {
    this.writes.push(() => {
      this.store.docs.delete(ref.path);
    });
    return this;
  }

  protected flush() {
    // All-or-nothing, like a real batch or transaction commit.
    const snapshot = new Map(
      [...this.store.docs.entries()].map(([path, data]) => [path, clone(data)]),
    );
    try {
      for (const write of this.writes) write();
    } catch (error) {
      this.store.docs.clear();
      for (const [path, data] of snapshot) this.store.docs.set(path, data);
      throw error;
    }
  }
}

class FakeBatch extends FakeWriteBuffer {
  async commit() {
    if (this.writes.length > 500) {
      throw Object.assign(
        new Error('3 INVALID_ARGUMENT: maximum 500 writes allowed per request'),
        { code: 3 },
      );
    }
    if (this.store.failCommitAt === this.store.batchSizes.length) {
      this.store.failCommitAt = undefined;
      throw new Error('simulated batch commit failure');
    }
    this.flush();
    this.store.batchSizes.push(this.writes.length);
  }
}

class FakeTransaction extends FakeWriteBuffer {
  async get(ref: FakeDocRef) {
    return ref.get();
  }

  commit() {
    this.flush();
  }
}

export class FakeFirestore {
  readonly docs = new Map<string, Data>();
  /** Number of writes in each committed batch, in commit order. */
  readonly batchSizes: number[] = [];
  /** Every query that was executed, with the fields it filtered on. */
  readonly queries: Array<{ collection: string; filters: string[] }> = [];
  /** Make the batch commit with this zero-based index fail once. */
  failCommitAt: number | undefined;
  private counter = 0;

  nextId() {
    this.counter += 1;
    return `auto-${this.counter}`;
  }

  seed(path: string, data: Data) {
    this.docs.set(path, clone(data));
    return this;
  }

  read(path: string): Data | undefined {
    const data = this.docs.get(path);
    return data === undefined ? undefined : clone(data);
  }

  paths(collectionPath: string): string[] {
    const depth = collectionPath.split('/').length + 1;
    return [...this.docs.keys()].filter(
      (path) =>
        path.startsWith(`${collectionPath}/`) && path.split('/').length === depth,
    );
  }

  applySet(path: string, data: Data, options?: { merge?: boolean }) {
    const base = options?.merge ? clone(this.docs.get(path) ?? {}) : {};
    mergeInto(base, data);
    this.docs.set(path, base);
  }

  applyUpdate(path: string, data: Data) {
    const existing = this.docs.get(path);
    if (existing === undefined) throw notFoundError();
    const next = clone(existing);
    applyUpdate(next, data);
    this.docs.set(path, next);
  }

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  batch() {
    return new FakeBatch(this);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
    const transaction = new FakeTransaction(this);
    const result = await callback(transaction);
    transaction.commit();
    return result;
  }
}
