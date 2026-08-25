'use client';

// The parent's marketplace — the SAME screen the student browses.
//
// It used to be a parent-only list: its own cards, its own two tabs, no filters,
// no day/time narrowing, no promotions, no capacity language, and a join modal
// on the card itself. That was a second description of one catalogue, and the
// parent got the poorer half of it while being the person least able to judge a
// class without the detail.
//
// What was here that is deliberately NOT here any more: joining from a card.
// A card cannot ask which child it is for, and §5 puts the child choice and its
// two checks inside the booking flow — which lives on the class page. Every
// card now opens /parent/classes/[groupId], where ChildPickerCheck runs before
// anything is joined or paid.

import ParentShell from '@/components/parent/ParentShell';
import ExploreMarketplace from '@/components/marketplace/ExploreMarketplace';

export default function ParentClassesPage() {
  return (
    <ParentShell>
      <ExploreMarketplace variant="parent" />
    </ParentShell>
  );
}
