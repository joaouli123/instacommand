# Validation status — 2026-09-21

This is a work-in-progress evidence log, not a claim that the platform is complete.

## Current evidence

- Production ownership transfer completed in one serializable transaction: 20 Instagram links and one Threads link moved from the legacy admin to the confirmed personal workspace. 142 publication records preserved. UI verified two active Instagram accounts, 18 pending choices, and connected Threads.
- Production Analytics inspection: Header displayed @lowfybr while the report displayed @joaouli1. Replaced independent hook state with a shared external store; added protection against stale analytics responses. Four store tests and production build pass. Commit 8c8a1af deployed; live browser verified Header/report alignment and switching from @joaouli1 (5,329 followers) to @lowfybr (3,337).
- Added an independent Threads report endpoint and tab: workspace ownership, period, account metrics, bounded content pagination, CSV export, explicit missing-data/permission/rate-limit states. Threads OAuth now requests threads_manage_insights. Five report tests and six OAuth tests pass. Commit f6d2349 deployed to both services; Coolify rolling updates completed. Live Threads report returned 21 posts over 30 days, second-page navigation worked, and switching to seven days returned two posts. Screenshot inspected. CSV download has not been verified. Per-post Threads insights, audience breakdowns and Facebook reports remain incomplete.
- Production Threads insights diagnostic: both /me/threads_insights?metric=views and the v1.0 equivalent returned HTTP 500 with an empty JSON body. Content reads succeed with the same stored authorization. This does not establish whether the cause is missing scope or a Meta service problem. Never classify this as permission denial without evidence. Existing authorization still needs scope inspection/reconsent validation.
- Reloaded the production Accounts page after transfer: @joaouli1 and @lowfybr remain active, Threads @joaouli1 remains connected, and 18 additional Instagram accounts remain pending user selection. No additional accounts activated, disconnected or publicly posted during this validation.
- Removed name/first-Page guessing from portfolio OAuth discovery. Portfolio-only Instagram assets remain selectable without a fabricated Page ID; verified Page edges take precedence. Facebook publishing now checks the exact Page-to-Instagram relationship before any write, including for legacy records. Backend build and 21 OAuth/link/Threads tests pass, including zero mocked uploads on mismatched mappings. Commit c2e9acc deployed with rolling update complete (lqsmckksusinhbszvwsvooy5).
- Live read-only link checks in the new backend verified @joaouli1 -> Joao Lucas uli and @lowfybr -> Lowfy. No public content was created. Live Facebook fields id/name/followers_count/fan_count succeeded (18/18 and 203/203 respectively). The posts edge returned real older posts with created_time/permalink_url/reactions.summary.total_count/comments.summary.total_count. Shares were absent, not verified zero.
- Separate Facebook report implemented and deployed in 1cc4c16 (backend nd9pnod4wigmsakqnu3bk23s; frontend lvt9xgkakigi48za5klfrjlc; both rolling updates complete). Live UI verified: 30 days for Joao Lucas uli returns zero posts; 730 days returns five, with 18 followers; selecting Lowfy returns three posts and 203 followers. Screenshot inspected. Reports validate ownership and Page identity, bound pagination, preserve partial results, distinguish missing counters from zero, and explain that post counters are lifetime-to-query rather than period-only activity. Seven additional report tests pass, 28 backend tests total; backend/frontend builds and frontend typecheck pass. Reach/views, demographics, graphs and Facebook-only (without Instagram) Page onboarding are not implemented.
- Facebook CSV export code exists with formula neutralization, but live download verification failed: the browser download event timed out after the click, no console error was recorded, and the expected file was absent from the standard Downloads directory. Do not claim export end-to-end verified. No repeated export clicks were made.
- Daily three-post planning added and deployed in e27c5d2 (frontend cn9xbl24hfwubqilxxeqmxsj; backend xzmvxszzwpqdk7ye8r5qpucq; rolling updates completed). New daily mode validates exactly three complete posts, caption limits, formats, times, CTA, creative brief, Story idea and timing caveat. Composer supports editing each caption and explicitly applying an item, with replacement confirmation for existing content. Account changes discard stale requests. Five schema tests and three mocked-provider tests pass; all 33 prior-plus-schema backend tests and frontend/backend builds pass. Production screenshot verified the enabled daily button and existing account selection. Real Gemini generation and applying real results are not verified: an async confirmation asks whether to send @lowfybr bio/metrics/up to eight captions to the configured Gemini. No live generation was submitted. Plans remain in component state and are not yet persisted as drafts; artwork is still a brief, not generated media.
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

Finish durable daily-plan-to-drafts editing and test real generation when the specific data-sharing choice is answered. Complete report exports and Facebook reach/views/audience coverage; resolve the Threads Insights HTTP 500 with scope inspection/reconsent verification, and finish Threads per-post/audience coverage. The broad AI/editorial/upload/publishing requirements remain open. AI now has text modes caption/plan/daily/audit/reply; image input and artwork generation are not yet present. Inspect current official Meta requirements before adding scopes or metric names. Preserve historical data; never guess Facebook Page mappings based on profile names.

Threads reference: Meta-maintained Postman account-insights and post-insights requests, retrieved 2026-09-21: https://www.postman.com/meta/threads/request/4pbwq2u/get-account-insights and https://www.postman.com/meta/threads/request/434u2bd/get-post-insights . Direct developer-documentation retrieval returned HTTP 429; live permission/response verification is still required.
