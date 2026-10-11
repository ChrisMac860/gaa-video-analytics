# GAA men's Gaelic football: scoring, restarts and stats rules (2026 season)

Research date: 2026-10-11. Scope: men's senior/inter-county and club Gaelic football. Ladies' football (LGFA) is governed separately and was not verified here.

Status legend: **[CONFIRMED]** stated in a dated secondary source that describes the adopted rule; **[PROPOSED]** trial or under review; **[UNVERIFIED]** not found in any source checked, or from general knowledge.

Primary official source (Official Guide Part 2 / Playing Rules) was NOT reachable: gaa.ie articles were fetched via summaries, and the Special Congress motion PDF and the Official Guide were not retrieved. Treat every rule below as needing a check against the 2026 Official Guide before it is hard-coded.

---

## 1. Scoring values

| Score | Value | Status |
|---|---|---|
| Goal (ball under/over crossbar into net) | 3 | **[CONFIRMED]** in force for 2026 (FRC final report, Sept 2025, rejected a 4-point goal for now: "Further analysis is required") |
| Point (from inside 40m arc, or any non-qualifying score) | 1 | **[CONFIRMED]** |
| Two-point score (see below) | 2 | **[CONFIRMED]** effective 1 Jan 2026 |
| Four-point goal | 4 | **[PROPOSED]** trial for the "2027 season" (report dated 29 Aug 2026: trial in third-level Division 1 league; not in force) |

### Two-point score: exact rule

- **[CONFIRMED]** A **converted shot from outside the 40m arc** scores **2**. The arc is radius 40m, centred on the midpoint of the goal line. Points from inside the arc are 1.
- **[CONFIRMED]** Since 1 Jan 2026 (Special Congress, Oct 2025), a two-pointer is **not** downgraded by an opposition touch. It is downgraded only if **another player of the shooter's team** touches the ball after it is kicked. (Previously any touch, including a keeper's, reduced it to 1.) The word "directly" was removed from the rule, so a shot that hits the post and still goes over and between the posts scores 2.
- **[CONFIRMED]** Signalled by an umpire's **orange flag**, raised after the referee signals two points with two hands in the air.
- **[CONFIRMED]** Wording in sources: "kick over the bar... from on or outside the 40-metre arc" and "converted shots... count as two-point scores". Sources say *kicked*, so hand-passed or fisted scores are not clearly covered.
- **[UNVERIFIED] 45s:** One 2025 summary says a successfully converted '45' is still 1 point; the trial-era version gave 2 for a 45, and Ciarán Whelan criticised that ("A 45 should be one point"). Treat as **1 point for 45s**, pending the Guide.
- **[UNVERIFIED] Frees from outside the arc, sideline kicks, and "mark" kicks:** Sources do not say. The rule text as summarised ("converted shots from outside the arc") implies 2 for any kicked score from outside the arc, including frees. Mark this as a classification choice in the schema (`shot_type` carries it), not a value.
- **[PROPOSED] Hand/fisted scores:** The Sept 2025 FRC report says banning them is "being considered". The Aug 2026 report says fisted points would be allowed only while the ball is in flight, in trial. Not in force.

### Scoreline notation

- **[UNVERIFIED]** No source found showing a special notation for two-pointers. Standard practice is goals-points with the total points (e.g. `1-12`), where a two-pointer contributes 2 to the points total. Record the **point value per event** rather than inferring it from the scoreline.

---

## 2. Pitch, arc and lines

- **[UNVERIFIED, general knowledge of Playing Rules; confirm in Official Guide]** Pitch 130–145m x 80–90m. Goal line, 13m, 20m, 45m lines, and the 40m scoring arc. The 40m arc is measured from the midpoint of the goal line.
- **[CONFIRMED via 2025 sources]** The 40m arc is the new scoring boundary. The arc itself was a new marking on pitches for the 2025 season.
- 20m line: kick-out restart line.
- 45m line: '45' restart when the attack puts the ball over its own end line.
- 13m: penalty/free mark (general knowledge; unverified here).

---

## 3. Kick-out (restart from the 20m line)

- **[CONFIRMED]** Taken from the 20m line by the defending team.
- **[CONFIRMED]** Since 1 Jan 2026, a defending team's kick-out must travel **past the 20m line and beyond the 40m arc** before another player of that team can play it. Sources differ on phrasing; the "past the 20m line as well as the 40m arc" wording is the one from the Aug 2026-era summary. A simpler and safer stats rule: classify by whether the ball has crossed the 40m arc.
- **[CONFIRMED]** Three outfield players from each team must be in each half at all times (hold-back, from the 2024 package made permanent).
- **[CONFIRMED]** Penalty for delaying the kick-out mark changes from a throw-in to a free kick (FRC 2025 proposal, adopted at Oct 2025 Special Congress).
- **[PROPOSED]** Kick-out distance cut to 13m (Aug 2026 trial report). Not in force.
- **[UNVERIFIED]** A 50m advance applies if an opponent interferes or intercepts inside the arc (Kclr96/2026 summary). Not confirmed in the Guide.

### Kick-out stat convention (recommended, not GAA-official)

- `won` = retained by own team after the kick-out (by catch, pick-up or first-contact win), counted at the first touch by the kicking side's player.
- `lost` = opposition gains possession.
- `contested` = an opponent touches or competes for the ball before it is won (mark contested).
- `uncontested` = own player takes it cleanly.
- `short` (lands inside the 40m arc, or is not beyond the 20m line) vs `long` (beyond the 40m arc). Use the 40m arc boundary, since it is the rule.
- `retained` is the common analyst term for `won`.

---

## 4. Other FRC rule changes relevant to stats

- **[CONFIRMED]** Solo and go: FRC proposed clarifying how the distance is enforced. Exact distance not verified.
- **[CONFIRMED]** Black card for deliberately pulling an opponent's jersey to deny a goal-scoring opportunity, with penalty. Applies to club and inter-county senior, U20, minor and junior (Oct 2025 Special Congress).
- **[CONFIRMED]** Early movement before 1v1 throw-ins is penalised. Neutral sideline officials can report foul play.
- **[CONFIRMED]** Penalty awards for cynical fouls in goal-scoring situations extended to club competitions.
- **[UNVERIFIED]** 3v3 hold-back: see section 3 (three outfield players per half).
- **[UNVERIFIED]** Attacking mark, hooter/clock, and the 50m advance for dissent: not found in sources checked. Treat as unknown.
- **[UNVERIFIED]** Match duration: club vs county durations not verified.

---

## 5. Stat definitions (analyst convention, not GAA-official)

These are common analyst conventions. They are not defined in the Official Guide. Use them as the app's definitions and document them in the UI.

- **Shot attempt:** any kick or hand-pass at the goal that results in a score, a wide, a short, a save, a block, or hits the post/bar. Include frees, 45s, and penalties as attempts, tagged by `shot_type`. Exclude goalkeeper's distribution.
- **Score:** goal (3), point (1), two-point (2).
- **Wide:** shot passes outside the posts or over the bar and goes out of play beyond the posts. Includes 45s and frees.
- **Short:** shot does not reach the goal line / goalkeeper catches or pick up from the shot or drops short of the goal.
- **Saved:** keeper gets hands on the shot and it does not go in (includes parry).
- **Blocked:** defender touches the shot before it reaches goal line.
- **Post:** shot hits the post or crossbar and does not score; a re-shot is a new attempt.
- **Turnover won:** possession gained from an opponent (tackle, interception, won breaking ball, forced error). **Turnover conceded:** possession lost to an opponent. Distinguish **forced** (under pressure) vs **unforced** (own error).
- **Kick-out retention:** kick-outs won / total kick-outs (see section 3).
- **Shot conversion %:** scores / shot attempts. Report separately for play, free and 45 shot types, because conversion differs sharply.
- **45 won:** the attacking side gets a 45 from the opposition's play (not a scored ball). Wide from a 45 is counted as a wide with `shot_type = 45`.

**Is a wide that goes out for a 45 still a wide?** [UNVERIFIED] Yes under the usual convention: the shot is a wide with `shot_type = 45`. Not confirmed by a source.

---

## 6. Proposed event taxonomy (JSON-friendly enums)

```json
{
  "score_outcome": ["goal", "point", "two_point", "wide", "short", "saved", "blocked", "post"],
  "shot_type": ["play", "free", "45", "mark", "penalty", "sideline"],
  "kickout": {
    "result": ["won", "lost"],
    "distance": ["short", "long"],
    "contest": ["contested", "uncontested"]
  },
  "turnover": {
    "result": ["won", "lost"],
    "type": ["tackle", "interception", "breaking_ball", "forced_error", "unforced_error", "foul_won", "foul_conceded", "other"],
    "pressure": ["forced", "unforced"]
  },
  "period": ["throw_in", "half_time", "full_time"],
  "other": ["restart_free", "restart_45", "restart_kickout", "yellow_card", "black_card", "red_card", "substitution", "timeout"]
}
```

Notes:
- `two_point` is recorded from the kick and the arc test (outside 40m, converted, no same-team touch after kick), and is not inferred from the scoreline.
- `shot_type` carries the restart origin. A 45 that is converted is a `point` (1), not `two_point`, pending the Guide check.
- `period`: `throw_in` is the start event for both halves. `half_time` and `full_time` are markers, not turnovers.
- `score_outcome` and `shot_type` are orthogonal, so a free can be `two_point` or `point` depending on distance.

---

## 7. Confidence / uncertainties

**Higher confidence**
- Goal = 3 in 2026; point = 1; two-point rule from outside the 40m arc, effective 1 Jan 2026; no opposition-touch downgrade; same-team touch after the kick voids it; orange flag signal.
- Kick-out from the 20m line, must go beyond the arc; 3-per-half hold-back; black card for jersey-pulling in goal-scoring denial; kick-out delay is a free.

**Lower confidence / open**
- 45s: 1 or 2 points. Sources say 1 (2025 summary and the criticism of the trial rule); the trial-era rule gave 2. Verify in the Official Guide.
- Frees, sideline and mark kicks from outside the arc: 2 points if converted, per the literal rule; no source states this explicitly.
- Hand/fisted scores: rule text says "kicked"; the 2026 trial bans fisted points except in flight. Current status unclear.
- Kick-out exact wording: "past the 20m line" vs "beyond the 40m arc" phrasing differs between sources. Use the arc test.
- Pitch dimensions, 13m/45m line positions, and arc geometry: general knowledge, not checked in the Guide.
- Four-point goal: trial only (Aug 2026 report). Do not implement as current.
- 13m kick-out and 50m advance: 13m is a trial proposal; 50m advance is unverified.
- Ladies (LGFA): not verified. Assume the rules above are men's/GAA-wide only, and separate rules may apply.
- Club vs county: black card and penalty extension confirmed for club; match durations and hooter not verified.
- Source conflict: one article calls goals 4 points "in these reports"; the Sept 2025 FRC report and the 2026 balls.ie summary say 3 points. Treat 3 as current.
- Stat conventions in section 5 are analyst conventions, not GAA definitions.

**Recommended next step:** Pull the 2026 Official Guide (gaa.ie Official Guide PDF, Part 2 Playing Rules) and the Special Congress 2025 motion text, then verify section 1 (45s and frees) and section 3 (kick-out wording) before hard-coding.

---

## Sources

- FRC final report, gaa.ie (dated 4 Sept 2025): https://www.gaa.ie/article/football-review-committee-publishes-final-report
- All 62 motions passed at Special Congress (Oct 2025), gaa.ie: https://www.gaa.ie/article/all-62-motions-passed-at-gaa-special-congress
- All 62 motions, Donegal Live (mirror, 403 on fetch): https://www.donegallive.ie/sport/all-62-motions-passed-at-gaa-special-congress-in-dublin-6732311
- FRC 2026 goals / balls.ie: https://www.balls.ie/gaa/frc-gaelic-football-2026-goals-639378
- Four-point goal trial proposal (Hogan Stand, 29 Aug 2026): https://hoganstand.com/Article/Index/341579
- Two-point scores, RTÉ (Apr 2025): https://rte.ie/sport/football/2025/0423/1509070-big-guns-slower-to-exploit-two-point-rule-whelan
- Ciarán Whelan on 45s (balls.ie): https://www.balls.ie/gaa/i-cant-understand-that-logic-ciaran-whelan-has-doubts-about-questionable-new-rule-613655
- Explained: FRC proposals (Westmeath Independent): https://westmeathindependent.ie/?p=100553
- Scoring in Gaelic games (Wikipedia, background only): https://en.wikipedia.org/wiki/Scoring_in_Gaelic_games
- Official Guide (gaa.ie): not retrieved; check before implementation.
