# Class Match Week — build documentation

A one-week campaign: teachers run short free taster sessions drawn from classes
they already teach, families attend at no cost, and a discount unlocks on that
teacher's ongoing paid class.

**Companion to:** Class Match Week Product Specification v2.

## Contents

| File | Covers |
|---|---|
| [00-overview.md](./00-overview.md) | Supply reality, sequencing, eligibility gate, known production issues |
| [01-foundations.md](./01-foundations.md) | Data model, teacher supply, session creation, discounts |
| [02-discovery-matching.md](./02-discovery-matching.md) | Portal, questionnaire, matching engine, results and no-match |
| [03-conversion-loop.md](./03-conversion-loop.md) | Signup handoff, reservation, attendance, coupon issuance, checkout |
| [04-launch-readiness.md](./04-launch-readiness.md) | Dashboards, banner, reminders, Explore, admin export |
| [05-deferrable.md](./05-deferrable.md) | Join queue, Notify me, banner extras |
| [06-appendix.md](./06-appendix.md) | Every open item, blocking decision and accepted risk in one place |

## About the figures in these documents

**Every supply figure was measured against production (`nfkrfciozjxrodkusrhh`)
on 2026-08-16, not estimated.** Where a number appears — eleven teachers,
twenty-one classes, thirteen matchable — it came from a query.

Two things to know before quoting any of them:

1. **Platform-owned classes are excluded.** `jovangoodluck@myitutor.com` owned
   nine of the thirty classes previously counted, four of them carrying
   contradictory subject and level data. They are not campaign supply, and
   excluding them changes every figure. The pre-exclusion numbers (twelve
   teachers, thirty classes) appear in older drafts and are superseded.
2. **Re-measure before publishing externally.** The catalogue changes whenever
   a teacher publishes a class or fills in a schedule, which is the entire
   point of the pre-launch supply push.

## Why these live in the repo

Review passes working from pasted excerpts repeatedly flagged decisions as
unstated when they were three paragraphs further down. Committing the documents
removes that whole class of false finding, and lets any agent or engineer read
the reasoning next to the code it constrains.
