# Identity coverage test: which provider reads which Caribbean documents

**Question:** for each provider, can it verify genuine Trinidad and Tobago, Guyana and Barbados passports, national ID cards and driver's permits? The answer decides `config/identityRouting.ts` (default provider, per-country routes, the fallback order).

> **Stripe test mode cannot prove country coverage.** Test mode accepts Stripe's fixed test documents and says nothing about whether a real Trinidadian ID card will be read. The same holds for sandbox and test integrations at Didit and Veriff: Veriff's test integrations "do not issue decisions" on their own, and Didit's sandbox simulates outcomes. Coverage can only be proven with **real documents in a live (production-mode) account** of each provider. That is a separate, deliberate step that needs your sign-off, live credentials that this build never used, and the consent of every document holder. Until it is done, treat every cell below as **unknown**.

## What gets recorded

Every finished attempt is written to `identity_outcomes` (migration 275) with: provider, document country (the one the teacher picked), document type (when the provider returns it), neutral outcome, neutral reason, the provider's raw code, attempt number and seconds taken. It holds **no names, ID numbers or images**. Cost is not in the database: take it from each provider's invoice or price list.

Use **one test account per physical document** (so its attempts group together), and record the document's *version* (old or new design, issue year) in the sheet, since the database does not store it.

## The scorecard (copy one row per document tested)

| Provider | Country | Document type | Old / new version | Pass / fail | Error code (raw) | Neutral reason | Attempts | Time (s) | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| stripe | TT | Passport | new | | | | | | | |
| stripe | TT | National ID card | old | | | | | | | |
| stripe | TT | National ID card | new | | | | | | | |
| stripe | TT | Driver's permit | | | | | | | | |
| stripe | GY | Passport | | | | | | | | |
| stripe | GY | National ID card | | | | | | | | |
| stripe | GY | Driver's licence | | | | | | | | |
| stripe | BB | Passport | | | | | | | | |
| stripe | BB | National ID card | | | | | | | | |
| stripe | BB | Driver's licence | | | | | | | | |
| didit | (same 10 rows) | | | | | | | | | |
| veriff | (same 10 rows) | | | | | | | | | |

Test **at least 10 genuine documents per provider, country and document type** you intend to rely on. Fewer than 10 cannot show 9 in 10.

## The rule

> A provider **works** for a country and document type only if **at least 9 in 10 genuine documents pass within two attempts**.

"Within two attempts" means the document reached `verified` on attempt 1 or 2. A document that needed a third attempt, or never passed, counts as a fail for this rule. Note that the product's total cap is 3 attempts across all providers, so a provider that only passes on the third try is not good enough.

## Reading the results from the database

Per provider, country and document type, the share of documents that passed within two attempts (one test account per document):

```sql
with per_doc as (
  select tutor_id, provider, country,
         coalesce(max(document_type), 'unknown') as document_type,
         bool_or(outcome = 'verified' and attempt <= 2) as passed_within_two,
         min(attempt) filter (where outcome = 'verified') as passed_on_attempt,
         max(duration_seconds) filter (where outcome = 'verified') as seconds_to_pass
  from identity_outcomes
  where tutor_id is not null
  group by tutor_id, provider, country
)
select provider, country, document_type,
       count(*) as documents,
       count(*) filter (where passed_within_two) as passed_within_two,
       round(100.0 * count(*) filter (where passed_within_two) / count(*), 0) as pct,
       round(avg(seconds_to_pass)) as avg_seconds
from per_doc
group by 1, 2, 3
order by 1, 2, 3;
```

What failed and why, with the provider's own codes (this is how the TODOs in `lib/identity/mapping.ts` get resolved):

```sql
select provider, country, outcome, reason, provider_code, count(*)
from identity_outcomes
where outcome <> 'verified'
group by 1, 2, 3, 4, 5
order by count(*) desc;
```

## Go / no-go

Fill in one row per provider, country and document type, then act on the decision column.

| Provider | Country | Document type | Documents tested | Passed within 2 attempts | Pass rate | Avg time | Cost each | Decision |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

| Pass rate (within 2 attempts) | Documents tested | Decision | What to change |
|---|---|---|---|
| 90% or more | 10 or more | **GO** for that document type | Put the provider first for that country in `countryRoutes` |
| 90% or more | fewer than 10 | **NOT PROVEN** | Test more documents |
| 70% to 89% | any | **NO-GO as the first route; usable as a fallback** | Keep it later in the chain; tell teachers which document to use |
| under 70% | any | **NO-GO** | Remove it from that country's route |
| any | any, and the failures are `not_supported` | **NO-GO for that document type** | Route that country elsewhere; the app already falls through automatically |

A **country** is covered when at least one provider is GO for **passport** and for at least one local ID document. If a country has no GO provider, teachers from that country will end at "contact support": decide what to do for them before launch (this build has no manual identity route).

## Unknowns the test must resolve

These are marked `TODO` in the code because the vendors' public docs are silent or unclear:

1. **Didit:** the code for "document or country not supported", and any consent-declined signal. Until known, an unsupported document looks like `retryable_failure / unknown` (so it retries instead of falling back). Record the raw `provider_code` of every Didit failure.
2. **Veriff:** there is no explicit "country not supported" code (571 is the closest); whether `document.country` on create restricts the document; the order of the age codes 530 to 536; the API base URL for your account; and that session deletion has been switched on by Veriff support.
3. **Stripe:** which Caribbean document types are accepted. Stripe's hosted flow offers passport, driving licence and ID card; whether a given country's version is read can only be seen live.
4. **All providers:** time to a decision and cost per verification, including failed attempts.

## Running the test safely

- Real documents are personal data. Get written consent from each holder, use accounts created for the test only, and delete the sessions afterwards (an admin decision, the retention sweep, or account deletion each redact the provider's copy).
- Use the provider's **live** mode only for this test, with credentials kept out of the repository, on a machine you control. This repository's scripts never use live keys.
- Record results as you go; do not rely on memory.
