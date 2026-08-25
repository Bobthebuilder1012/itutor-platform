'use client';

// The student's Explore screen. Everything it renders now lives in
// components/marketplace/ExploreMarketplace, because the parent renders the same
// screen at /parent/classes — see the note at the top of that file for why the
// two must not be separate implementations.

import ExploreMarketplace from '@/components/marketplace/ExploreMarketplace';

export default function FindTutorsPage() {
  return <ExploreMarketplace variant="student" />;
}
