import { google } from 'googleapis';
import type { StoreMetrics, StoreReview, StoreRating } from '@/lib/types/store-metrics';

function getAuth() {
  const b64 = process.env.GOOGLE_PLAY_API_JSON_BASE64;
  if (!b64) throw new Error('GOOGLE_PLAY_API_JSON_BASE64 missing');
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as {
    client_email: string;
    private_key: string;
  };
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
}

export async function fetchGooglePlayMetrics(
  date: string,
): Promise<StoreMetrics> {
  const packageName =
    process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.pennyai.penny';
  const auth = getAuth();
  const publisher = google.androidpublisher({ version: 'v3', auth });

  const reviewsRes = await publisher.reviews.list({
    packageName,
    maxResults: 50,
  });

  const newReviews: StoreReview[] = (reviewsRes.data.reviews ?? []).flatMap(
    (r) => {
      const c = r.comments?.[0]?.userComment;
      if (!c?.starRating) return [];
      const stars = Math.max(1, Math.min(5, c.starRating)) as StoreRating;
      const lastModMs = c.lastModified?.seconds
        ? Number(c.lastModified.seconds) * 1000
        : Date.now();
      return [
        {
          id: r.reviewId ?? `${lastModMs}`,
          stars,
          text: c.text ?? '',
          userLocale: c.reviewerLanguage ?? 'unknown',
          submittedAt: new Date(lastModMs).toISOString(),
        },
      ];
    },
  );

  return {
    platform: 'android',
    date,
    installs: 0, // TODO: use play.console.reports.query in a future pass
    uninstalls: 0,
    crashes: 0,
    avgRating: 0,
    ratingCount: 0,
    newRatings: newReviews.length,
    newReviews,
    fetchedAt: new Date().toISOString(),
  };
}
