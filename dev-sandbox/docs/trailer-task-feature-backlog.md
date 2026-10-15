# Cozy Palace — trailer tasks and feature requests

Status: tracker publication approved by the user. **10 production tasks and 5 future requests are published and individually verified on GitHub**, all open and unassigned, with no milestones or confirmed due dates. Existing issues were checked before creation; no matches existed. No implementation or production completion is claimed. IDs below remain local references; their GitHub mappings appear below.

## Provenance and dates

- N1–N8 refer to the verbatim excerpts in [2026-10-15 meeting notes](meetings/2026-10-15-trailer-working-session.md#source-notes).
- P refers to the [video plan](marketing-video-plan.md), including its earlier German performance direction and audio/export safeguards. Acceptance criteria below are proposed production/discovery checks, not verbatim meeting commitments.
- W = Friday/weekend checkpoint, **2026-10-16–2026-10-18 inferred** from the Thursday session. Exact task deadlines unresolved.
- T = Tuesday trailer delivery target, **2026-10-20 inferred** from that session. Exact deadline/timezone and delivery approval unresolved. T does not give future features a deadline.

## Trailer production tasks

All tasks begin in Backlog (recorded in issue bodies; no Project board exists yet). German is the evidenced narrator/presenter; this does not assign him editing, production management, a GitHub account, or an unconfirmed recording date.

| ID / outcome | Owner | Due date | Dependencies | Proposed acceptance criteria | Source |
| --- | --- | --- | --- | --- | --- |
| V01 — lock 60s outline and script | unresolved | unresolved; W goal | Confirm examples, approver, real demo and VR feasibility | Approved timed outline totals 60s; scratch read fits without rushing; sells favorite content plus useful work; includes labeled magic concept and real VR ending, not enterprise feature list | N1, N3, N7, N8; P |
| V02 — record narration and presenter footage | German: narration/presentation established; recording/production owner unresolved | unresolved; available filming during W | V01, German availability, real-room vs composite choice | Clean full take and room tone; warm natural delivery, unlit pipe, original understated humor; personal example approved; no imitation; clip paths logged | N8; P performance/audio |
| V03 — prepare and film staged magic set piece | unresolved | unresolved; W goal | V01; separate implementation authorization; cleared sample content | Repeatable one-off arrangement/population scene with reset instructions and clip path; `Concept sequence` legible throughout; capture log marks staged; no claim of working auto organization or integrations | N7, N8; P footage rules |
| V04 — capture actual working demo | unresolved | unresolved; W goal | Selected build, supported objects, cleared sample links | Real placement and select/open captured successfully; item identity remains clear; build/device/action/result/path logged; browser handoff shown honestly; failures reported rather than hidden | N2, N8; P demo proof |
| V05 — capture real VR ending | unresolved | unresolved; W filming goal, required before T edit lock | Target headset, working XR flow, capture method, V01 | Participant headset shot plus actual headset footage convey scale/presence versus web; slow readable movement; device/build/result logged; no synthetic XR, fake embedded players, or implied multiplayer; escalate blocked capture | N8; P VR ending |
| V06 — assemble edit | unresolved | unresolved; supports T | V01–V05 and approved demo destination | Rough cut follows timed story, ends in real VR with four-second end card, labels concept footage, uses one CTA; reviewer understands what saved objects do and what is only conceptual | N1, N3, N7, N8; P |
| V07 — mix audio | unresolved | unresolved; supports T | V02, V06, verified music license/file | Speech intelligible on phone speaker; room tone and natural pauses retained; music ducked; no fake in-headset playback cue; rights recorded | P audio/export; N1 |
| V08 — prepare captions | unresolved | unresolved; supports T | Locked words and edit | Captions match spoken words and timing; readable on target screen; do not obscure object labels or `Concept sequence`; sound-off review passes | P audio/export; N1 |
| V09 — QA claims, rights, and delivery | unresolved | unresolved; before export, supports T | V04–V08, delivery specs, approved URL, reviewer | Check actual-demo vs staged vs future claims; real VR provenance; private data removed; music/media cleared; URL works; captions and audio reviewed; duration measured and 60s target approved; unresolved blockers recorded | N1–N8; P safeguards |
| V10 — export approved trailer | unresolved | unresolved; T delivery target | V09 pass, final approver, format/channel decision | Approved captioned master plays through after export; frame size, codec, duration, audio and captions checked; final path and approval recorded; destination contains no placeholder. Upload/publication requires separate approval | N1; P export |

Set-piece implementation remains a later scoped task. No app or XR code should change merely because V03 appears here. The separate demo referenced by the CTA also needs an approved destination and available content; this document does not claim it has been produced.

## Future requests: discovery before implementation

These are separate from trailer delivery. Every owner and due date is **unresolved**. Acceptance below is for a reviewable discovery/specification outcome, not a claim that the feature exists or that implementation is approved.

| ID / request | Owner | Due date | Dependencies / questions | Proposed acceptance criteria for discovery | Source |
| --- | --- | --- | --- | --- | --- |
| F01 — room search with transparency and glowing results | unresolved | unresolved | Define searchable content, matching, occlusion, desktop/VR controls | Spec shows matching items glowing, unrelated geometry becoming transparent, no-result behavior, clear/reset, and accessibility alternative; prototype evidence explicitly labeled if staged | N4 |
| F02 — `seal ID` populates relevant Confluence and C3/C4 material | unresolved | unresolved | Meaning of `seal ID`, C3/C4 scope, source systems, authorization, retrieval relevance | Approved example query and expected permitted documents mapped into room objects; define empty/error states, source attribution, permissions and refresh behavior. Preserve identifier literally; no guessed acronym or live integration claim | N5 |
| F03 — markdown creation for Copilot and other tools | unresolved | unresolved | Define input material, markdown format, intended tools and handoff | Example input and expected `.md` output reviewed; decide create/download/copy workflow and privacy rules; distinguish manual handoff from any future integration | N6 |
| F04 — Adobe Stock asset workflow | unresolved | unresolved | Determine whether links/manual lookup or API integration is wanted; licensing and access | Storyboard finding and organizing video/media resources with source/license metadata; clarify preview versus licensed asset use; no automatic licensing or download claim | N6 |
| F05 — automatic organization/population into items | unresolved | unresolved | Grouping rules, supported content, placement constraints, user control; distinct from V03 | Spec and labeled concept show input-to-object mapping, proposed layout, user confirmation, undo and failure handling; define an eventual real implementation test independently of the trailer's staged animation | N7 |

## Verified GitHub tracking

Repository: [Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox). Issues and Projects repository settings were already enabled. Created and read back the labels `Trailer`, `Demo set piece`, and `Feature request`. Each issue preserves the row's outcome, acceptance criteria, dependencies, source notes, ownership uncertainty, and inferred-date caveat.

| Local ID | Verified issue | Labels |
| --- | --- | --- |
| V01 | [#6 — outline and script](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/6) | Trailer |
| V02 | [#7 — narration and presenter](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/7) | Trailer |
| V03 | [#8 — staged magic set piece](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/8) | Trailer; Demo set piece |
| V04 | [#9 — working demo capture](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/9) | Trailer |
| V05 | [#10 — real VR ending](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/10) | Trailer |
| V06 | [#11 — assemble edit](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/11) | Trailer |
| V07 | [#12 — audio mix](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/12) | Trailer |
| V08 | [#13 — captions](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/13) | Trailer |
| V09 | [#14 — QA claims, rights, delivery](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/14) | Trailer |
| V10 | [#15 — approved export](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/15) | Trailer |
| F01 | [#16 — room search](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/16) | Feature request |
| F02 | [#17 — seal ID / Confluence / C3/C4](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/17) | Feature request |
| F03 | [#18 — markdown / Copilot](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/18) | Feature request |
| F04 | [#19 — Adobe Stock workflow](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/19) | Feature request |
| F05 | [#20 — automatic organization](https://github.com/Misc-Palace-XR-Hack-2026/misc.-palace-dev-sandbox/issues/20) | Feature request |

### Project board: blocked, not created

Board URL: **unavailable — no board created or existing board verified**. The project-list prerequisite failed with the exact error `your authentication token is missing required scopes [read:project]`. The active token has `gist`, `read:org`, `repo`, and `workflow`, but not Projects scopes. No alternative secrets were retrieved and no authentication refresh was initiated.

An authorized interactive account refresh with Projects write scope (`gh auth refresh -s project`) is needed before retrying. Then check existing organization/repository projects for duplicates, create or reuse the appropriate board, use statuses **Backlog / Ready / In progress / Review / Done**, add these 15 issues, and verify every item/status and the board URL. All should initially be Backlog unless new evidence supports another state. Repository Projects being enabled does not mean a Project board has been configured.

### Working rules

- Keep Issues as the canonical work-item discussion and acceptance record; this document is its provenance and index. A future Project board should be a view of these same issues, not a competing list.
- Ask people to accept ownership and confirm GitHub identity before assigning accounts. German's narrator role does not identify an account.
- Keep W/T dates explicitly inferred and unresolved, not confirmed due dates. Future requests have no Tuesday deadline.
- Keep actual working demo, visibly labeled staged concepts, and future product functionality distinct. V03 does not authorize unrelated application/XR changes.
- Link later branches/PRs to relevant approved issues. Mark Done only when acceptance evidence is present; a merged PR alone does not prove filming or export happened.
- Trailer upload/publication still requires separate approval; the authorization here covers repository documentation and task tracking only.
