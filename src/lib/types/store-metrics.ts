export type StoreRating = 1 | 2 | 3 | 4 | 5;

export interface StoreReview {
  id: string;
  stars: StoreRating;
  text: string;
  userLocale: string;
  submittedAt: string; // ISO
}

export interface StoreMetrics {
  platform: 'ios' | 'android';
  date: string; // yyyy-mm-dd
  installs: number;
  uninstalls: number;
  crashes: number;
  avgRating: number;
  ratingCount: number;
  newRatings: number;
  newReviews: StoreReview[];
  revenueCents?: number;
  fetchedAt: string; // ISO
}
