# Facilitator Script — CoGEN Pilot Study

**Total duration:** ~82 minutes | **Your role:** Facilitator (you are NOT the Live Share host — one of the participants will host)

---

## Pre-Session Setup (15–20 min before participants arrive)

- [ ] Confirm the participant who will act as **Live Share host** knows their role
- [ ] **Pre-install the CoGEN extension (.vsix) on all machines** — do not leave this for the session
- [ ] Start VS Code on host machine, load the project, run `npm run compile`
- [ ] Verify Express server starts (port 4000) and MongoDB connection is live
- [ ] Test @AI chat with a throwaway message
- [ ] Prepare the coding project — repo open and ready on host machine
- [ ] Set up screen recording on all machines
- [ ] Have consent forms printed — confirm they include disclosure of screen recording and interaction data logging (chat messages, task events)
- [ ] Have the **pre-survey Google Form link** ready to share
- [ ] Have the **post-survey Google Form link** ready to share
- [ ] Have paper/whiteboard ready for Disney Method (you will write the group's top 3 on this)
- [ ] Brief your note-taker: their timer starts when coding begins at 0:20

**[SELF NOTE]** Before participants arrive, decide which participant you'll assign to each Disney role (Dreamer / Realist / Critic) once you've observed them during coding. You can revise this during Phase 3.

**[SELF NOTE]** You will give a brief walkthrough of how CoGEN works before coding starts — see the separate system overview document/presentation for this.

---

## Phase 0: Welcome & Consent (0:00 – 0:05)

**SAY:**
> "Thanks for joining today. We're running a study on CoGEN — an AI-powered project manager built for collaborative coding sessions. Before we start, please sign the consent form. This covers screen and audio recording, and the fact that the platform logs interaction data like chat messages and task events."

**DO:**
- Hand out consent forms — wait for all signatures before proceeding

---

## Phase 0b: Pre-Survey (0:05 – 0:10)

**SAY:**
> "Please fill out this short background survey before we begin. It takes about 5 minutes and helps us understand your experience level. There are no right or wrong answers."

**DO:**
- Share the **pre-survey link**
- Give 5 minutes to complete silently
- Do not answer questions about the tool during this time

---

## Phase 1: System Overview & Setup (0:10 – 0:18)

**[SELF NOTE]** Give a brief walkthrough of how CoGEN works — see separate system overview presentation. Cover: what @AI is for, what the task tracker shows, what the team chat is for. Keep it under 5 minutes. Do not over-explain — let them discover.

**SAY (after overview):**
> "One thing to keep in mind: **@AI is your project manager, not a coding assistant.** Use it for coordination and planning questions — like 'what should I work on?', 'how does my task connect to theirs?', 'I'm stuck on where to start.' For actual coding help, use your own tools — Copilot, ChatGPT, whatever you normally use."

> "The goal today is to **experience this platform and give us honest feedback** — not to build something complete. There's no pressure to finish."

> "One more thing: if something surprises you or confuses you during coding, just say it out loud. You don't need to commentate everything — just the moments that stand out. This helps us a lot."

**[SELF NOTE]** This lightweight think-aloud request is intentional. Without it, your note-taker is guessing what participants are thinking. Even brief verbalisations ("I'm not sure what this does") give you in-situ data that the post-survey can't capture retrospectively.

**DO:**
- Have the **host participant** create the Live Share session
- Have the other two participants join the Live Share link
- Walk through the guest onboarding flow (name + strengths/weaknesses form)

**SAY:**
> "Fill in your name and a quick note about your strengths and weaknesses as a developer. The AI uses this to divide tasks — be honest, it affects your assignment."

**Once all guests have joined and submitted profiles:**
> "Good. The AI will now analyse the project and divide it into tasks."

---

## Phase 2: AI Task Division (0:18 – 0:23)

**[SELF NOTE]** You trigger the task division — this is a facilitator action, not a participant action.

**DO:**
- Trigger the AI task division
- Give participants 1–2 minutes to read their assigned tasks silently

**SAY:**
> "Take a moment to read your tasks. The AI divided the project based on the description and your developer profiles."

**ASK:**
> "Does everyone understand what they're working on? Any questions before we start?"

**REMIND:**
> "@AI for coordination, your own tools for coding. Focus on experiencing the platform."

**DO NOT** ask evaluative questions about the task split — save for post-survey and discussion.

---

## Phase 3: Coding Session (0:23 – 0:53)

**SAY:**
> "Go ahead. If something surprises or confuses you, say it out loud. I'll only step in for technical issues."

---

**YOUR ROLE — stay silent unless:**
- There is a technical failure (server crash, chat not loading, task tracker broken)
- A participant has been stuck with zero progress for more than 3 minutes

**If the tool breaks:**
Fix it quickly → note the exact timestamp → "Sorry about that, please continue" → go quiet

**If someone uses @AI for a coding question:**
> "For coding questions use your own tools. @AI is for project coordination — like 'what should I do next?'"

**If someone is stuck for >3 min:**
> "What are you trying to do right now?" — gets them talking without leading their evaluation

---

**AT 0:43 — 10 minute warning:**
> "About 10 minutes left. If there's a feature you haven't tried yet — @AI, task tracker, team chat — now's a good time."

**AT 0:51 — 2 minute warning:**
> "Let's wrap up in 2 minutes. Save your work."

**[SELF NOTE]** During coding, observe and finalise your Disney role assignments:
- **Dreamer** → most vocal / enthusiastic
- **Realist** → most pragmatic / focused on getting things done
- **Critic** → most frustrated / skeptical

---

## Phase 4: Post-Survey (0:53 – 1:01)

**SAY:**
> "Before we talk as a group, please fill out this survey individually. Don't discuss with each other yet — answer based on your own experience. It takes about 8 minutes."

**DO:**
- Share the **post-survey link**
- Start a timer for 8 minutes
- Stay quiet — do not look over their shoulders

**[SELF NOTE]** If someone finishes in under 4 minutes, note it — may indicate rushing. You can gently say "take a bit more time if you need it" without pressuring.

**AFTER SURVEY:**
> "Thank you. Let's talk through the experience together now."

---

## Phase 5: Group Discussion (1:01 – 1:19)

**[SELF NOTE]** The post-survey already collected individual feature ratings and individual reflections. The discussion does NOT need to revisit those in depth. Keep the opening brief (2–3 min max) and spend the bulk of time on the Disney Method, which is where your most valuable redesign insights will come from.

**SAY:**
> "The survey covered your individual impressions. Now I want to hear the group's perspective — and specifically, I want us to think about how to improve this platform. Honest, critical feedback is the most useful thing you can give us."

---

### Step 1: Quick Opening (2–3 min)

Ask only if something striking came up during coding that you want to surface quickly:

- > "Was there a moment during the session that really stood out — good or bad?"
- > "Did the AI's task division feel fair? Did it match your skills?"

**[SELF NOTE]** Do not spend more than 3 minutes here. The post-survey covered feature ratings and reflections already. Move to the Disney activity as soon as you have a brief opening.

---

### Step 2: Disney Method Redesign Activity (15–17 min)

**[SELF NOTE]** This is the most important part of the session. You will leave with 3 participant-generated redesign priorities that become the "implications for design" section of your thesis. Do not rush or skip rounds.

**INTRODUCE:**
> "For the next part, I'm giving each of you a specific thinking role. [Name], you're the Dreamer. [Name], you're the Realist. [Name], you're the Critic. I'll explain each role as we go."

---

**Round 1 — Dreamer (3 min):**

**SAY:**
> "[Name] — no technical constraints, no budget, no 'that's not possible.' If CoGEN could do absolutely anything to make a session like today's work better, what would it do? Think big."

*Stay quiet and let them speak fully. Take notes — these ideas feed Round 4.*

**If they stay conservative or say "I don't know":**
> "Imagine you're pitching the ideal version of this tool to a team of engineers with unlimited time. What's the first thing you'd want?"

**If they focus too much on bugs:**
> "Set aside specific bugs for now — I want to hear about features and capabilities. What would make this fundamentally better?"

---

**Round 2 — Realist (3 min):**

**SAY:**
> "[Name] — you heard the Dreamer. Of everything they described, what could actually be built? What's the one change that would have had the biggest positive impact on today's session specifically?"

*Let them respond directly to the Dreamer's ideas. This creates dialogue between the roles.*

**If they're stuck or repeat what the Dreamer said:**
> "I'm asking you to filter — of all those ideas, which one is most feasible and most impactful? Pick one."

**If they dismiss all of the Dreamer's ideas:**
> "Fair — so what would you add instead? What's the most practical improvement you can think of?"

---

**Round 3 — Critic (3 min):**

**SAY:**
> "[Name] — even if we built exactly what the Realist described, what would still be broken? What problem would still not be solved?"

*This round often surfaces the core tension. Give the Critic time — don't rush past this.*

**If they agree with everything:**
> "Play devil's advocate. What's the biggest risk of that change? What could go wrong?"

**If they give a vague answer:**
> "Can you give me a specific moment from today that wouldn't be fixed by what the Realist proposed?"

---

**Round 4 — Open Group (5–6 min):**

**SAY:**
> "Let's bring this together. If we were releasing the next version of CoGEN next month, what are the **three most important changes** to make? Let's agree on a list."

**[SELF NOTE]** Facilitate consensus — don't impose your own view. Write their exact phrasing on paper, visible to everyone. If they can't agree, use this prompt:

> "Which change would have made the biggest difference specifically to today's session — start there."

*Once the top 3 are written down:*
> "Do all three of you agree these are the most important? Anyone want to swap one out?"

**[SELF NOTE]** Write verbatim if possible — these quotes go directly into your thesis.

---

### Step 3: Closing (2 min)

**SAY:**
> "Last question: Would you use CoGEN in a real team project? And if not — what would have to change first?"

*(Ask this conditionally — don't accept a simple yes or no. You want them to articulate the gap.)*

> "Anything else you want to say before we finish?"

---

## Phase 6: Wrap-Up (1:19 – 1:22)

**SAY:**
> "Thank you — this is very helpful. Your feedback will directly shape the next version of this platform."

**DO:**
- Stop all screen recordings
- Thank each participant

**IMMEDIATELY AFTER PARTICIPANTS LEAVE:**
- Export post-survey responses from Google Forms
- Write your own observations while fresh (what surprised you, what broke, the group's top 3 in their exact words)
- Export MongoDB logs: @AI messages, task events, chat timestamps
- Debrief with your note-taker — compare what you both observed before either of you writes anything up

---

## Quick Reference: Session Timeline

| Phase | Activity | Time |
|-------|----------|------|
| 0 | Welcome + consent | 0:00 – 0:05 |
| 0b | Pre-survey | 0:05 – 0:10 |
| 1 | System overview + Live Share setup + onboarding | 0:10 – 0:18 |
| 2 | AI task division | 0:18 – 0:23 |
| 3 | Coding session | 0:23 – 0:53 |
| 4 | Post-survey (individual, silent) | 0:53 – 1:01 |
| 5a | Quick opening | 1:01 – 1:04 |
| 5b | Disney — Dreamer | 1:04 – 1:07 |
| 5c | Disney — Realist | 1:07 – 1:10 |
| 5d | Disney — Critic | 1:10 – 1:13 |
| 5e | Disney — Open group top 3 | 1:13 – 1:19 |
| 5f | Closing | 1:17 – 1:19 |
| 6 | Wrap-up | 1:19 – 1:22 |

---

## Facilitation Tips

| Situation | Response |
|-----------|----------|
| One person dominates | "That's useful — [other name], what was your experience with that?" |
| Answers are vague | "Can you give me a specific moment from today when that happened?" |
| Participants are too positive | "We're more interested in what didn't work — that's the most useful feedback." |
| They go off-topic | "Good point — let's come back to that. Returning to [topic]..." |
| Disney roles feel awkward | Drop the role names — say "I want each of you to think from a different angle" |
| Running over time | Cut the Critic round — Dreamer + Realist + Open Group are the minimum |
| Participants can't agree on top 3 | "Which change would have mattered most to today's session specifically?" |
