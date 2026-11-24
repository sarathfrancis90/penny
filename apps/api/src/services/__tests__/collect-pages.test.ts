import { describe, expect, it } from 'vitest';
import { collectPages } from '../firestore-mobile-data';

interface FakePage {
  limit(n: number): FakePage;
  startAfter(doc: number): FakePage;
  get(): Promise<{ docs: number[] }>;
}

function fakeQuery(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: number[] = [];
  const make = (start: number, take = Infinity): FakePage => ({
    limit: (n: number) => make(start, n),
    startAfter: (doc: number) => make(doc + 1, take),
    get: async () => {
      calls.push(start);
      return { docs: rows.slice(start, start + take) };
    },
  });
  return { query: make(0), calls };
}

describe('collectPages', () => {
  it('returns every document beyond the first page', async () => {
    const { query, calls } = fakeQuery(1234);
    const docs = await collectPages(query, 500, 10_000);
    expect(docs).toHaveLength(1234);
    expect(docs[0]).toBe(0);
    expect(docs[1233]).toBe(1233);
    expect(calls).toEqual([0, 500, 1000]);
  });

  it('stops at the maximum', async () => {
    const { query } = fakeQuery(50);
    expect(await collectPages(query, 20, 30)).toHaveLength(30);
  });

  it('makes one extra read when the total is an exact page multiple', async () => {
    const { query, calls } = fakeQuery(40);
    expect(await collectPages(query, 20, 100)).toHaveLength(40);
    expect(calls).toEqual([0, 20, 40]);
  });
});
