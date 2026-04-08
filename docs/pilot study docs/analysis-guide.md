# Analysis Guide & Thesis Notes — HelloCigen Pilot Study

---

## Part 1: Step-by-Step Analysis Workflow

### Step 1: Compute SUS Scores (15 min)

For each participant, use this formula on their 10 SUS responses (Q1–Q10):
- **Odd-numbered items** (Q1, Q3, Q5, Q7, Q9): contribution = response − 1
- **Even-numbered items** (Q2, Q4, Q6, Q8, Q10): contribution = 5 − response
- Sum all 10 contributions → multiply by 2.5 → **SUS score (0–100)**

| Benchmark | Score |
|-----------|-------|
| Poor | < 51 |
| OK | 51–67 |
| Good | 68–80 |
| Excellent | > 80 |
| Industry average | ~68 |

**Report as:** Individual scores (P1/P2/P3) + mean. E.g. "P1=62, P2=55, P3=70, mean=62.3 — below the industry average of 68, suggesting usability improvements are needed before wider deployment."

---

### Step 2: Build the Trust Anchor Comparison Table (20 min)

Create this table from pre-survey Q10–Q12 and post-survey Q11–Q13:

| Item | P1 Pre | P1 Post | P2 Pre | P2 Post | P3 Pre | P3 Post |
|------|--------|---------|--------|---------|--------|---------|
| "Reliable guidance" | | | | | | |
| "Follow task assignments" | | | | | | |
| "Comfortable with AI decisions" | | | | | | |

**Do NOT compute statistics.** Describe direction qualitatively:
> "Two of three participants showed increased trust on item 2 after using the tool. P2 showed a decrease (3→2), which aligns with their post-survey comment [quote] and their discussion statement [quote]."

---

### Step 3: Feature Priority Ranking (15 min)

From post-survey Q14–Q18 ratings (1–5 per feature):

| Feature | P1 | P2 | P3 | Mean |
|---------|----|----|----|----|
| Onboarding | | | | |
| AI Task Division | | | | |
| Task Tracker | | | | |
| @AI Chat | | | | |
| Collaboration Awareness | | | | |

Sort by mean (ascending) → **lowest-rated features = highest redesign priority.**

Cross-reference with note-taker timestamps: did the lowest-rated feature also generate the most confusion observations?

---

### Step 4: Expectation Gap Analysis (30 min — most valuable)

For each participant, read side by side:
- Pre Q13 (expectations) + Pre Q14 (concerns)
- Post Q21 (experience vs expectations) + Post Q22 (did concern come true?)

Write a 2–3 paragraph narrative per participant:

```
P1 expected [X] (Pre Q13). Their concern was [Y] (Pre Q14).
After the session, they described [Z] (Post Q21). Concern Y [did/did not] materialize — [quote from Q22].
This gap reveals [insight].
```

This becomes the "Expectation vs. Reality" subsection in your thesis.

---

### Step 5: Thematic Analysis of Open-ended Responses (2–4 hours)

**Data sources:** Post-survey Q14b–Q18b (feature open-ended), Q20 (missing PM features), Q23–Q25 (individual reflection), discussion recording/notes.

**Method: Affinity Mapping**
1. Print or paste all responses into a document (or sticky notes)
2. Read all responses once without categorizing
3. Highlight any phrase describing a problem, need, positive reaction, or suggestion
4. Group highlights by similarity → name each cluster (these are your themes)
5. Count how many participants contributed to each theme

**Aim for 3–5 themes.** Examples of what might emerge:
- "Unclear what @AI is for" (confusion about AI scope)
- "Task division felt arbitrary" (trust/fairness issue)
- "Didn't know what teammates were doing" (awareness gap)
- "Wanted AI to proactively update task status" (proactive PM feature request)

**For thesis:** Report each theme with 2–3 supporting quotes. Label quotes by participant (P1, P2, P3) and source (survey/discussion). Do not anonymize within your group — n=3 makes anonymization meaningless anyway.

---

### Step 6: Log Data Triangulation (30–60 min)

Pull from MongoDB after the session:

| Log event | What to extract | Cross-reference with |
|-----------|----------------|---------------------|
| `chat_history` — @AI messages | Count per participant, topics asked | Q17 (actionability rating) |
| Task state changes | When tasks were marked complete | Q16 (tracker usage) |
| Session timestamps | Time to first @AI use, time to first task complete | Note-taker confusion timestamps |
| Message frequency | Chat messages per participant over time | Q18 (collaboration awareness) |

**Key triangulation questions:**
- Did the participant who rated @AI lowest (Q17) also send the fewest @AI messages? → Suggests avoidance
- Did participants who rated collaboration awareness lowest (Q18) also have the fewest chat messages? → Suggests the chat didn't help awareness
- Were there long gaps in chat activity coinciding with confusion timestamps? → Suggests silent frustration

This section in the thesis is called "Behavioral Evidence" — it's what separates a credible HCI study from pure self-report.

---

## Part 2: Thesis Write-up Structure

### Suggested section structure for the pilot study chapter:

```
4. Pilot Study
  4.1 Study Design
      - Participatory design study with 3 participants
      - Mixed-methods: pre/post survey + observation + group discussion
      - Platform version X.X tested
  4.2 Participants
      - Table: P1/P2/P3 demographics from pre-survey
      - Experience levels
  4.3 Procedure
      - Timeline: setup → coding (35 min) → post-survey (8 min) → discussion (20 min)
      - Reference consent, recording, think-aloud protocol
  4.4 Findings
    4.4.1 Usability (SUS scores + interpretation)
    4.4.2 Feature Evaluation (priority ranking table + top 2-3 open-ended themes per feature)
    4.4.3 AI Trust (pre→post table + qualitative description)
    4.4.4 Expectation vs. Reality (per-participant narrative)
    4.4.5 Themes from Open-ended Responses and Discussion (3–5 themes with quotes)
    4.4.6 Behavioral Evidence (log data triangulation)
  4.5 Implications for Design
      - Bullet list of 3–5 specific design changes, grounded in findings
      - These come directly from the Disney Method redesign activity
  4.6 Limitations
      - n=3 limits generalizability
      - Single session, short duration
      - Familiarity effects (participants may know each other)
```

---

## Part 3: Notes for the Final Study

These are things to change or add when you run the full study (n=15–20):

**Methodology upgrades:**
- Add NASA-TLX (cognitive workload) — relevant if you want to argue the tool reduced coordination overhead. Not worth it at n=3, but at n=15 it adds value.
- Run SUS as primary usability measure (you already have it drafted). At n=15 you can compute confidence intervals.
- Add inter-rater reliability check for qualitative coding (second coder, Cohen's kappa).
- Consider a **control condition** — same task, same team size, without HelloCigen. Strongest possible design for your thesis.

**Protocol improvements (based on what might go wrong in the pilot):**
- Test the extension installation process with one person before the session — this is the most likely failure point
- Pre-install the .vsix on all machines the night before
- Have a backup of the project repo ready in case Live Share drops
- If @AI response latency is high (>5 sec), participants will stop using it — monitor and note if this happens

**Survey improvements for final study:**
- Add TAM (Davis, 1989) — 4 perceived usefulness + 4 ease of use items. At n=15+ this becomes analyzable.
- Add a "would you recommend?" single item (Net Promoter Score proxy: 0–10 scale).
- Consider adding UMUX-Lite (2 items) as a faster usability complement to SUS — gives a second usability data point.

**Recruitment considerations:**
- For the final study, recruit participants who don't know each other (controls for pre-existing team dynamics)
- Vary experience levels intentionally (mixed-skill teams vs. homogeneous teams) — this is a variable worth testing

---

## Part 4: Miscellaneous Notes

**On reporting n=3 findings in your thesis:**
Never say "most participants felt X." With n=3, say "two of three participants" or "P1 and P3 both noted." Be precise. Reviewers will flag "most" with n=3.

**On the Disney Method output:**
The group's "top 3 redesign changes" from the discussion ARE your implications for design section. Quote them directly. Frame as: "Participants collectively identified three priority changes: [1], [2], [3]. These align with the low feature ratings on [X] and the thematic finding that [Y]."

**On using quotes in a thesis:**
Quotes need attribution (P1, P2, P3 — consistent labeling throughout). If a participant said something particularly striking, use it verbatim. Short quotes (1 sentence) can be inline. Longer quotes (2+ sentences) indent as a block quote.

**On the pre-survey expectation anchors:**
These are your strongest tool for demonstrating research rigor at n=3. You collected data BEFORE exposure — so you can show you didn't lead participants toward any particular conclusion. This is methodologically clean.

**On platform bugs during the session:**
If anything breaks during the coding session, note the timestamp and what happened. In the thesis, acknowledge it honestly: "During the session, [X] occurred at approximately [time]. Participants were affected for approximately [duration]. This is noted as a limitation." Trying to hide bugs makes reviewers suspicious. Acknowledging them shows methodological honesty.
