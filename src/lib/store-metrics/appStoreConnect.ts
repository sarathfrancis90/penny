import jwt from 'jsonwebtoken';
import type { StoreMetrics, StoreReview, StoreRating } from '@/lib/types/store-metrics';

const API_BASE = 'https://api.appstoreconnect.apple.com';

function makeToken(): string {
  const p8 = process.env.APP_STORE_CONNECT_P8_BASE64;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  if (!p8 || !keyId || !issuerId) {
    throw new Error('App Store Connect credentials missing');
  }
  const privateKey = Buffer.from(p8, 'base64').toString('utf8');
  return jwt.sign(
    {
      iss: issuerId,
      exp: Math.floor(Date.now() / 1000) + 20 * 60,
      aud: 'appstoreconnect-v1',
    },
    privateKey,
    { algorithm: 'ES256', keyid: keyId },
  );
}

interface AscReviewAttrs {
  rating: number;
  title?: string;
  body?: string;
  reviewerNickname?: string;
  createdDate: string;
  territory?: string;
}
interface AscReview {
  id: string;
  attributes: AscReviewAttrs;
}

export async function fetchAppStoreMetrics(date: string): Promise<StoreMetrics> {
  const appId = process.env.APP_STORE_CONNECT_APP_ID;
  if (!appId) throw new Error('APP_STORE_CONNECT_APP_ID missing');

  const token = makeToken();
  const headers = { Authorization: `Bearer ${token}` };

  // Customer reviews (paginated by default; 50 per page is plenty for daily ingestion)
  const reviewsRes = await fetch(
    `${API_BASE}/v1/apps/${appId}/customerReviews?limit=50&sort=-createdDate`,
    { headers },
  );
  if (!reviewsRes.ok) {
    throw new Error(
      `App Store Connect reviews ${reviewsRes.status}: ${await reviewsRes.text()}`,
    );
  }
  const reviewsJson = (await reviewsRes.json()) as { data: AscReview[] };

  const newReviews: StoreReview[] = (reviewsJson.data ?? []).map((r) => ({
    id: r.id,
    stars: Math.max(1, Math.min(5, r.attributes.rating)) as StoreRating,
    text: [r.attributes.title, r.attributes.body].filter(Boolean).join('\n\n'),
    userLocale: r.attributes.territory ?? 'unknown',
    submittedAt: r.attributes.createdDate,
  }));

  return {
    platform: 'ios',
    date,
    installs: 0, // TODO: parse /v1/salesReports gzipped TSV in a future pass
    uninstalls: 0,
    crashes: 0,
    avgRating: 0,
    ratingCount: 0,
    newRatings: newReviews.length,
    newReviews,
    fetchedAt: new Date().toISOString(),
  };
}
