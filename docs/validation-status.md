# Validation status — 2026-09-21

This is a work-in-progress evidence log, not a claim that the platform is complete.

## Current evidence

- Production ownership transfer completed in one serializable transaction: 20 Instagram links and one Threads link moved from the legacy admin to the confirmed personal workspace. 142 publication records preserved. UI verified two active Instagram accounts, 18 pending choices, and connected Threads.
- Production Analytics inspection: Header displayed @lowfybr while the report displayed @joaouli1. Replaced independent hook state with a shared external store; added protection against stale analytics responses. Four store tests and TypeScript validation pass. Deployment verification still required for this change.
- Analytics currently resolves ownership via InstagramAccount and reads Instagram metrics only. Facebook and Threads reports are NOT implemented here.
- Period selection reaches growth and engagement endpoints, but not dashboard totals, posts, recommendations or format/time analysis. This inconsistency remains to fix.
- Missing reach/impressions are shown as unavailable in cards but appear as zeros in charts. Availability must be represented independently of numeric zero.
- Screenshot/DOM captured in the browser for the Analytics observation; durable screenshot export has not been completed. This is not a completed visual or accessibility audit.

## Required completion gates

- [ ] Standalone login, logout, session expiry, account isolation, reconnect and multiple-account selection verified end-to-end.
- [ ] Instagram, Facebook and Threads connection status and permissions independently visible.
- [ ] Per-network profile, content, audience and period reports backed by real API data; no substitution between networks.
- [ ] Metrics availability, expired tokens and permission errors accurately explained; zeros distinguished from missing data.
- [ ] Consistent global account selection and race-safe requests verified in production.
- [ ] Upload, preview, order and removal of carousel media; single images, Reels, Stories and text validated.
- [ ] Explicit destination selection and format compatibility for Instagram, Facebook and Threads.
- [ ] Drafts, timezone-aware scheduling, partial failures, retries and duplicate prevention tested. No public test post without approved content.
- [ ] Profile audit and bio/name/positioning recommendations per profile with grounded inputs.
- [ ] Content strategy, feed plan, captions, hashtags and CTAs generated and editable.
- [ ] Artwork creation and carousel art generation implemented and tested, not just text suggestions.
- [ ] Editorial calendar and recommended order/time with sample-size and timezone explanations.
- [ ] Screenshot/insight uploads and analysis supported and tested.
- [ ] Direct-message/comment reply suggestions and supported delivery flows verified separately.
- [ ] Three-post daily plan with captions, CTA, order, times and Story ideas can become editable drafts.
- [ ] Onboarding for nontechnical users; no requirement to provide their own Meta app/token.
- [ ] Loading, empty, failure, mobile and keyboard states tested across all screens; notifications at bottom.
- [ ] Audit remaining trends, competitors, community, notifications, settings and AI configuration for nonfunctional/demo behavior.
- [ ] Tests, commit/push, production deployment and visual/runtime verification completed for each implementation batch.

## Next work

Verify the global-selector correction, then implement separate network report services with ownership checks and explicit availability before building network selectors. Inspect current official Meta requirements before adding scopes or metric names. Preserve historical data; never guess Facebook Page mappings based on profile names.
