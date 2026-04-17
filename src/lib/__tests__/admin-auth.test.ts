import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'admin-token') {
        return { uid: 'u1', email: 'a@b.c', admin: true } as const;
      }
      if (token === 'user-token') {
        return { uid: 'u2', email: 'x@y.z', admin: false } as const;
      }
      throw new Error('bad token');
    }),
  },
}));

const { requireAdmin, verifyAdmin, AdminAuthError } = await import('../admin-auth');

function mk(hdr?: string): NextRequest {
  return new NextRequest(
    'http://localhost/api/admin/x',
    hdr ? { headers: { authorization: hdr } } : undefined,
  );
}

describe('admin-auth (Firebase custom claims)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('requireAdmin', () => {
    it('throws 401 when no bearer token', async () => {
      await expect(requireAdmin(mk())).rejects.toBeInstanceOf(AdminAuthError);
      await expect(requireAdmin(mk())).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when token is not Bearer', async () => {
      await expect(requireAdmin(mk('Basic abc'))).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws 401 on invalid token', async () => {
      await expect(requireAdmin(mk('Bearer garbage'))).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws 403 when admin claim absent', async () => {
      await expect(requireAdmin(mk('Bearer user-token'))).rejects.toMatchObject({
        status: 403,
      });
    });

    it('returns uid + email on success', async () => {
      const res = await requireAdmin(mk('Bearer admin-token'));
      expect(res.uid).toBe('u1');
      expect(res.email).toBe('a@b.c');
    });
  });

  describe('verifyAdmin', () => {
    it('returns Response on auth failure', async () => {
      const res = await verifyAdmin(mk());
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(401);
    });

    it('returns AdminAuthInfo on success', async () => {
      const res = await verifyAdmin(mk('Bearer admin-token'));
      expect(res).not.toBeInstanceOf(Response);
      expect((res as { uid: string }).uid).toBe('u1');
    });
  });
});
