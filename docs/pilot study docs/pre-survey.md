# Pre-Survey — HelloCigen Pilot Study
**For Google Forms setup | ~12 questions | ~5 min**

Send link before participants arrive or during setup (first 5 min).

---

## Google Forms Setup Tips
- Set form to "collect email addresses: OFF"
- Add a short intro: *"Please fill this out before we begin. It takes about 5 minutes and helps us understand your background. There are no right or wrong answers."*
- Enable "required" on all questions except open-ended anchors (make those required too — don't let them skip)
- Use section breaks between sections to reduce overwhelm

---

## Section 1: About You

**Q1. What is your current role?**
*Type: Dropdown (single select)*
Options: Undergraduate Y1 / Undergraduate Y2 / Undergraduate Y3 / Undergraduate Y4 / Masters student / PhD student / Other

**Q2. How many years of programming experience do you have?**
*Type: Multiple choice (single select)*
Options: Less than 1 year / 1–2 years / 3–5 years / More than 5 years

> **Rationale:** Required for participant sample characterization in the thesis. Even with n=3, you must describe who participated. Language field removed — not relevant to HelloCigen.
> **Analysis:** Report as a simple participant profile table (P1/P2/P3 rows, demographics as columns).

---

## Section 2: Prior Tool Experience

*Scale for Q3–Q5: Never / Rarely (a few times) / Sometimes (monthly) / Often (weekly) / Very often (daily)*

**Q3. How often do you use AI coding tools? (e.g. GitHub Copilot, ChatGPT for code, Cursor)**
*Type: Linear scale 1–5, labeled Never → Very often*

**Q4. How familiar are you with VS Code Live Share?**
*Type: Linear scale 1–5, labeled Never used it → Use it regularly*

**Q5. How often do you do real-time collaborative coding with teammates? (e.g. pair programming, mob programming)**
*Type: Linear scale 1–5, labeled Never → Very often*

**Q6. Have you ever used an AI assistant to coordinate or assign tasks in a team project?**
*Type: Multiple choice (single select)*
Options: Yes / No / Not sure

**Q7. Have you ever used an AI assistant as a project planning or management tool?**
*Type: Multiple choice (single select)*
Options: Yes / No / Not sure

> **Rationale:** Q3–Q5 establish baseline experience levels. These contextualize qualitative findings — e.g. a participant with low AI tool experience who still finds @AI useful is a stronger signal than an experienced AI user. Q6–Q7 were split from one double-barreled question: *coordinating tasks* ≠ *project planning* — they reflect different behaviors.
> **Analysis:** Use as interpretive context per participant. Note experience level when quoting or analyzing individual responses.

---

## Section 3: Collaboration Preferences

*Scale: 1=Strongly Disagree → 5=Strongly Agree*

**Q8. I prefer working independently on coding tasks rather than in a team.**
*Type: Linear scale 1–5*

**Q9. I am comfortable letting others assign tasks to me during a project.**
*Type: Linear scale 1–5*

> **Rationale:** At n=3, these are NOT statistically analyzable. Use as interpretive context only — e.g. "P2 rated independence preference as 4/5, which may explain their pushback on AI-assigned tasks in the discussion."
> **Analysis:** Reference per-participant when interpreting qualitative findings. Do not compute averages.

---

## Section 4: Baseline Trust in AI

*Scale: 1=Strongly Disagree → 5=Strongly Agree*
*Label each end clearly in the form.*

**Q10. I believe AI systems can provide reliable guidance when I am unsure what to do.**
*Type: Linear scale 1–5*

**Q11. I am willing to follow task assignments made by an AI.**
*Type: Linear scale 1–5*

**Q12. I feel comfortable when an AI makes decisions about how work should be divided.**
*Type: Linear scale 1–5*

> **Rationale:** Adapted from Jian et al. (2000). These items measure *dispositional* trust in AI — a general attitude the participant holds before any experience with CoGEN. This is intentionally different from the post-survey Section 2 (TXAI items), which measures *situational* trust in CoGEN specifically after use. These are distinct constructs and should not be compared item-for-item; instead, use these pre-scores as a baseline covariate when interpreting post-survey trust scores.
> **Analysis:** Report as a per-participant baseline profile (P1/P2/P3 × Q10/Q11/Q12). Reference these scores when interpreting post-survey TXAI results — e.g. "P2 entered with low dispositional AI trust (2/5 on Q12) but rated post-session TXAI items moderately, suggesting CoGEN partially overcame initial skepticism."

---

## Section 5: Open-ended Anchors

**Q13. In 1–3 sentences: What do you expect an AI project manager to do for you during a coding session?**
*Type: Paragraph (long text)*
*Mark as required.*

**Q14. In 1–2 sentences: What is your biggest concern about letting an AI divide tasks for your team?**
*Type: Paragraph (long text)*
*Mark as required.*

> **Rationale:** These are the most valuable items in the pre-survey. Q13 mirrors post-survey Q21 ("how did your experience compare to expectations?") — this pairing creates the expectation gap analysis, which is the richest qualitative finding. Q14 mirrors post-survey Q22 ("did that concern come true?") — surfaces fear/skepticism before politeness filters it out post-session.
> **Analysis:** Read Q13/Q14 per participant before reading their post-survey responses Q21/Q22. Write a 2–3 sentence narrative per participant describing the gap. This becomes the "expectation vs. reality" section of the thesis.

---

## Unanswered Questions (Decide with Prof)

- **Jian et al. scale scope:** Q10–Q12 are 3 adapted items used as a dispositional baseline only — not matched item-for-item to the post-survey. In the thesis, frame as "adapted from Jian et al. (2000) to measure baseline dispositional trust in AI." The post-survey uses a separate instrument (TXAI, Hoffman et al., 2023) for system-specific trust.
- **Section 3 inclusion:** If the prof feels collaboration preference items are unnecessary for a pilot, drop Q8–Q9. They add ~30 sec and provide only interpretive (not analytical) value.
- **Timing:** If sending the form in advance (day before), note that expectations may be more considered than candid. If sent on the spot (first 5 min), expectations are more genuine but rushed.
