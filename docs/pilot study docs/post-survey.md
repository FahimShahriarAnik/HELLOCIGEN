# Post-Survey — CoGEN Pilot Study
**For Google Forms setup | 30 questions | ~8–10 min**

Distribute immediately after coding ends. Participants fill it out individually and silently BEFORE the group discussion starts. This prevents anchoring bias in individual reflection.

---

## Google Forms Setup Tips
- Add intro: *"Thank you for the session! Please answer these questions individually before we start the group discussion. Be honest — critical feedback is the most useful."*
- Separate SUS into its own section titled "Section 1: General Usability" — do NOT label it as "SUS" (biases responses)
- Set all open-ended questions as required
- Estimate 8–10 min. If participants look fatigued, facilitator can say "almost done, just a few more"

---

## Section 1: General Usability (SUS)

*"How much do you agree with each statement about CoGEN?"*
*Scale: 1=Strongly Disagree → 5=Strongly Agree*
*Add both endpoint labels in the form.*

**Q1.** I think that I would like to use this system frequently.
**Q2.** I found the system unnecessarily complex.
**Q3.** I thought the system was easy to use.
**Q4.** I think that I would need the support of a technical person to be able to use this system.
**Q5.** I found the various functions in this system were well integrated.
**Q6.** I thought there was too much inconsistency in this system.
**Q7.** I would imagine that most people would learn to use this system very quickly.
**Q8.** I found the system very cumbersome to use.
**Q9.** I felt very confident using the system.
**Q10.** I needed to learn a lot of things before I could get going with this system.

*All 10 items: Linear scale 1–5. Do not change wording.*

> **Rationale:** Full System Usability Scale (Brooke, 1996). Cannot be used partially — items are interdependent. Produces a single 0–100 score per participant. Even at n=3, comparing to the industry baseline of 68 (average) and 71 (good) is legitimate because it's a norm comparison, not within-sample statistics.
> **Scoring formula:** For odd items (Q1,3,5,7,9): score = response − 1. For even items (Q2,4,6,8,10): score = 5 − response. Sum all 10, multiply by 2.5 → SUS score (0–100).
> **Analysis:** Report individual SUS scores (P1/P2/P3) + mean. Compare to 68/71 benchmarks. Note: a pilot SUS score sets a baseline to show improvement in the final study.
> **Decision pending:** Prof to confirm whether SUS should be in pilot or reserved for final study.

---

## Section 2: Trust in AI

*"After today's session, how much do you agree with the following?"*
*Scale: 1=Strongly Disagree → 5=Strongly Agree*

**Q11.** I believe AI systems can provide reliable guidance when I am unsure what to do.
**Q12.** I was willing to follow the task assignments made by the AI.
**Q13.** I felt comfortable when the AI made decisions about how work should be divided.

*These are the same 3 items from the pre-survey — do not change wording.*

> **Rationale:** Adapted from Jian et al. (2000). Matched to pre-survey Q10–Q12 for pre→post comparison. At n=3, report as a per-participant table showing direction of change — not statistics. E.g. "P1 went from 2→4 on Q12, P2 from 3→2." One changed score with a supporting discussion quote is a meaningful finding.
> **Analysis:** Build a 3×3 comparison table (P1/P2/P3 × Q11/Q12/Q13, pre vs post). Describe direction per participant. Cross-reference with discussion quotes where trust came up.

---

## Section 3: Feature Ratings

*"Rate how useful each feature was during today's session."*
*Scale: 1=Not useful at all → 5=Extremely useful*

Each feature has a rating followed immediately by a required open-ended explanation.
**Do NOT make the open-ended optional** — with n=3 every response counts.

---

**Q14. Onboarding — How smooth was the process of joining the session?**
*Type: Linear scale 1–5*

**Q15. What caused friction, or what made it smooth?**
*Type: Paragraph (required)*

---

**Q16. AI Task Division — How well did the AI break down the project into tasks?**
*Type: Linear scale 1–5*

**Q17. What would have made the task breakdown better? Did the tasks match your skills and strengths?**
*Type: Paragraph (required)*

---

**Q18. Task Tracker — How useful was the task tracker sidebar?**
*Type: Linear scale 1–5*

**Q19. When did you check it during the session, and when did you ignore it?**
*Type: Paragraph (required)*

---

**Q20. @AI Chat — How actionable were @AI's responses in the chat?**
*Type: Linear scale 1–5*

**Q21. Describe a specific moment when @AI helped you — or failed to help.**
*Type: Paragraph (required)*

---

**Q22. Collaboration Awareness — How aware were you of what your teammates were working on?**
*Type: Linear scale 1–5*

**Q23. How did you actually find out what others were doing? (e.g. asked verbally, checked task tracker, guessed)**
*Type: Paragraph (required)*

---

> **Rationale:** Ratings give a feature priority ranking for redesign decisions. Open-ended responses are the real data — they surface *why* and *when*, which ratings alone cannot. Human-to-human chat and Live Share friction are handled in discussion (both are confounded by verbal communication when 3 people are in the same room).
> **Analysis:** Sort features by mean rating → redesign priority list. Use open-ended responses as primary data in thematic analysis. Cross-reference low ratings with note-taker timestamps.

---

## Section 4: AI as Project Manager

**Q24. Did CoGEN feel more like a project manager or a chatbot?**
*Type: Multiple choice (single select)*
Options:
- Definitely a chatbot
- More chatbot than project manager
- Somewhere in between
- More project manager than chatbot
- Definitely a project manager

**Q25. What was missing for it to feel more like a real project manager?**
*Type: Paragraph (required)*

**Q26. How did your actual experience compare to what you expected before the session?**
*Type: Paragraph (required)*
*[This mirrors pre-survey Q13 — read both together during analysis]*

**Q27. How did your expectations about AI task division compare to the reality of today's session?**
*Type: Paragraph (required)*
*[This mirrors pre-survey Q14 — read both together during analysis]*

> **Rationale:** Q24 is a directional signal — frequency count of 3 responses. Q25 generates specific feature ideas for the next iteration. Q26–Q27 are the expectation gap analysis, the most analytically rich part of the instrument. Read pre Q13+Q14 alongside post Q26+Q27 per participant.
> **Analysis:** Q24 → report as "X of 3 participants placed it closer to chatbot." Q25 → thematic coding for redesign. Q26+Q27 → per-participant narrative comparing pre answers to post answers.

---

## Section 5: Individual Reflection

*Answered individually before group discussion starts — prevents anchoring bias.*

**Q28. What was the single most frustrating moment during the session?**
*Type: Paragraph (required)*

**Q29. What was the single most helpful thing CoGEN did?**
*Type: Paragraph (required)*

**Q30. Was there a moment you wanted help from the tool but didn't get it? Describe it.**
*Type: Paragraph (required)*

> **Rationale:** Collecting these individually (before discussion) prevents anchoring bias — participants won't anchor to the most vocal person's frustrations. "Single most" framing forces prioritisation instead of listing everything.
> **Analysis:** Q28 responses → pain point ranking for redesign. Q29 → design strengths to preserve. Q30 → unmet needs analysis. These feed directly into the "implications for design" section.

---

## Unanswered Questions (Decide with Prof)

- **SUS in pilot or final study only?** Prof's call — see rationale in Section 1 above. If dropped, the form is ~20 questions, ~5 min.
- **Q24 wording:** "Project manager vs chatbot" framing may prime the answer. Alternative: "How would you describe the role @AI played?" (open-ended). More neutral but harder to compare across participants.
- **Qualitative coding workload:** 12 required open-ended responses × 3 participants = 36 qualitative data points. Solo coding is feasible (2–4 hours with affinity mapping). With a second coder, inter-rater reliability check significantly strengthens thesis validity.
