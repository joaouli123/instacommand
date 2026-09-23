# Design QA — Composer InstaCommand

**Findings**

- No confirmed P0/P1/P2 visual or interaction issue was observed in the accessible browser states. The final side-by-side fidelity review is blocked; this is not a formal visual pass.

**Comparison target and evidence**

- Source visual truth: `design/composer-flow/step-02-format-user-reference.png` and `design/composer-flow/step-03-content-user-reference.png` (user-provided references).
- Implementation: `http://localhost:3001/composer`, rendered from the local Next.js app.
- Browser viewport: 1462 × 905 CSS px, as reported by the in-app browser capture. Device pixel ratio normalization was not available.
- Implementation screenshot path: not persisted; the selected browser returned an in-session screenshot only.
- States observed: stage 1 empty account state; stage 2 with Reel selected; stage 3 with manual and AI modes, caption and hashtag interactions; stage 4 review state.
- Interaction evidence: switching format changed the guidance and preview to 9:16 for Reels; manual/AI choice toggled the AI controls; caption count and preview updated; adding a hashtag updated its counter and preview; review showed the selected network, format, caption, hashtag, schedule field, and publish actions.
- Typography, spacing, colors, image proportions, and copy were visually inspected in the supplied references and rendered browser captures. Feed preview omits a Stories strip; vertical formats use a 9:16 frame.

**Blocker**

The browser security policy rejected opening the workspace reference image for a combined, same-input side-by-side comparison with the implementation capture. Its policy explicitly prohibits reaching the same outcome through another browser surface or indirect route. Therefore, the required normalized composite comparison and persisted screenshot evidence could not be produced in this run.

**Implementation checklist**

- [x] Four-stage stepper and step-specific composition.
- [x] Dynamic format requirements and proportional social preview.
- [x] Manual/AI selection, caption tools, media grid, and hashtag editing.
- [x] TypeScript check and backend test suite.
- [ ] Combined source/implementation comparison at matched viewport and screenshot evidence.

**final result: blocked**

## Iteration — Compact preview and publish result (2026-09-22)

**Source visual truth**

- User references `codex-clipboard-a0b2d240-0258-4568-ab20-dffd1ddea891.png` and `codex-clipboard-bcd411d7-7f45-42a9-9f50-8a5f6d990fa3.png`: compact Instagram feed post with a single visible media, profile/header, action icons, caption and carousel indicators. `codex-clipboard-3ba4e9ef-b070-4715-a3ef-8857a3d7f390.png` shows the current overly tall/blank preview beside the carousel media grid.

**Changes**

- Replaced the tall device bezel preview with a compact post card. Feed and carousel use a 4:5 media crop; Reels/Stories keep a narrow 9:16 preview.
- Carousel preview now follows the selected editor thumbnail and has visible position, dots, and accessible previous/next controls.
- After a publish attempt, the composer now transitions to a persistent result screen with a per-network success or failure and the returned error. It offers calendar and new-post actions; it does not claim success when a network failed.
- Calendar deletion now explains that a published Instagram media item cannot be remotely deleted through the current API; Facebook/Threads remote deletion is attempted and any refusal is reported. The action is labeled `Excluir registro` for published items so local removal is not confused with remote deletion.
- Updated `frontend/tests/carousel-preview.test.cjs` to check the current preview markup rather than selectors from the old composer layout.

**Verification**

- `frontend`: `npx tsc --noEmit` passed; `node --test tests/*.test.cjs` passed (21/21); `git diff --check` passed.
- Local implementation screenshot was captured in the in-app browser at `http://127.0.0.1:3001/composer`, viewport 1462 × 905 CSS px. The visible state had no connected Instagram account and no media; browser console reported no warnings/errors.
- Consequently the real carousel-media state and post-result state could not be rendered locally for a same-state comparison against the references. Screenshot is in-session only, not persisted as a file. Production was not modified.
- In production calendar, the inspected test post showed published IDs for Instagram, Facebook, and Threads; no delete action was triggered.

**Required design QA surfaces**

- Typography/copy: existing product typography retained; compact card and result messages use short, explicit labels. Target-state wrapping is not visually verified.
- Layout/spacing: phone bezel removed; new card constrains width and preserves portrait ratios. Exact source-vs-rendered measure is blocked by the missing local account/media state.
- Colors/tokens: existing slate/indigo/emerald/rose tokens retained; publish result uses semantic success/warning/error colors.
- Image fidelity: source media is rendered directly in the preview using `object-cover`; no local media was available to inspect crop/sharpness.
- Responsive/accessibility: preview tabs remain, carousel controls expose labels and selected-state semantics; TypeScript and markup test pass. Visual mobile check remains pending.

**final result: blocked**

## Iteration — Hashtag entry and suggestions (2026-09-22)

**Source visual truth**

- User screenshot `codex-clipboard-33401a94-3f02-4d48-8505-2c6c0999a261.png`, showing the hashtag icon overlapping the field text and the insertion action.

**Implementation**

- Fixed the field padding (`pl-9.5` was not a valid spacing utility) and vertically centered the decorative hash icon.
- Split manual hashtag insertion from explicit Instagram lookup. Lookup uses the already-integrated Meta hashtag endpoint and is cached per account/tag for the current composer session to avoid duplicate requests.
- Added related-tag suggestions extracted from hashtags in captions returned by Meta, with a “show more” control and counts for the number of sample captions containing each tag.
- The UI explicitly labels Meta results as a sample, not a global post count. The current backend requests up to 25 top and 25 recent media items; these are not a lifetime or platform-wide total.
- Normalized duplicate detection case-insensitively, validates one hashtag at a time, and provides accessible labels/removal controls.

**Verification and limitation**

- `npx tsc --noEmit`: passed after adjusting regex/iteration syntax for the frontend TypeScript target.
- `git diff --check`: passed.
- Local browser reached the composer, but no Instagram account is connected in the local workspace. This prevents an end-to-end Meta hashtag lookup or reaching stage 3 through the normal gated flow; the production interface was not changed.
- The supplied screenshot shows the overlapping field and was used as the before-state. A rendered after-state screenshot and end-to-end response verification are unavailable in this environment, so this iteration is not a formal visual QA pass.

**final result: blocked**

## Iteration — AI content creation flow (2026-09-22)

**Source visual truth**

- Current reference: user screenshot `codex-clipboard-b8926c0d-ea16-4827-bac8-6f6b6aad00a0.png`, showing the crowded AI assistant panel and adjacent caption editor.
- Intended outcome: separate the brief, optional refinements, and desired AI deliverable; keep generated content reviewable and never schedule automatically.

**Implementation**

- `frontend/src/app/composer/page.tsx`: reorganized the AI section into a labeled brief, optional objective/tone controls, and three explicit outcomes (one caption, three-post daily plan, seven-day plan). The current workflow is visually selected and only its relevant action/output is shown. Weekly results clear when the brief changes.
- `frontend/src/components/dashboard/DailyContentPlan.tsx`: requires an idea before generation, identifies the account requirement, flags plans made from an older brief, and prevents saving/applying outdated plans.

**Verification**

- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Frontend `node --test`: 20 passed, 1 failed. The existing `carousel-preview.test.cjs` expects labels/markup `Navegação da prévia do carrossel`, `Ver mídia anterior` and `Ver próxima mídia`, which are absent from the current carousel preview. This assertion concerns a different part of the composer and was not changed in this iteration.
- Browser console: no errors or warnings observed in the local composer.
- The local test session has no connected social account, and direct clicks on the stage-3 stepper item did not switch the rendered screen. The updated AI section could not be captured in its target state or compared side-by-side with the supplied screenshot. No production page was changed.

**Fidelity surfaces**

- Typography/layout/colors/copy: code preserves existing composer tokens; the new flow groups controls into two numbered sections and makes labels and optionality explicit. Rendered target-state comparison remains unavailable.
- Icons: existing project icon library is used for the workflow choices.
- Responsiveness/accessibility: sections have labels and semantic controls; tabular controls collapse into one column on small widths through existing responsive classes. Browser confirmation remains pending.

**final result: blocked**

## Iteration — Stepper and composer icons (2026-09-22)

**Source visual truth**

- Current user references: stepper, social-network selector, format cards, and format-requirements tiles supplied in this conversation.
- Related saved source images: `design/composer-flow/step-02-format-user-reference.png` and `design/composer-flow/step-01-socials.png`.

**Implementation and evidence**

- Updated `frontend/src/app/composer/page.tsx`.
- Implementation URL: `http://127.0.0.1:3001/composer`.
- Browser viewport: 1462 × 905 CSS px.
- Current visible state: stage 1; the browser capture showed the four numbered steps with horizontal connectors, larger platform marks, and the empty-account selector state. Browser console check returned no errors or warnings.
- Focused verification of the format/review tiles was not possible in this session: the local workspace has no connected social account, and clicking the stepper did not transition the rendered page. Source inspection and `npx tsc --noEmit` confirm the related icon set and mappings compile.

**Changes made**

- Added horizontal connector rules between desktop stepper items, with completed connectors tinted indigo; mobile retains its two-column layout without crossing lines.
- Increased the social brand marks and their colored frames for more balanced proportions, using the existing Simple Icons brand package.
- Enlarged the format icons and used a stacked-page mark for Carousel.
- Added related icons to each of the four dynamic format-requirement tiles (ratio, dimensions, count/duration, file/type/API eligibility).

**Verification**

- `npx tsc --noEmit`: passed.
- Browser console: no warnings/errors observed.
- `git diff --check`: passed.
- Full visual comparison at matched interaction state and a persisted implementation screenshot are unavailable; this iteration therefore remains blocked for formal design-QA sign-off.

**final result: blocked**
