# Facilitator Script — HelloCigen Pilot Study

**Total duration:** ~80 minutes | **Your role:** Facilitator + Live Share host

---

## Pre-Session Setup (15–20 min before participants arrive)

- [ ] Start VS Code, load the project, run `npm run compile`
- [ ] Verify Express server starts (port 4000)
- [ ] Verify MongoDB connection is live
- [ ] Test @AI chat with a throwaway message
- [ ] Prepare the project description participants will build
- [ ] Set up screen recording software (record all screens if possible)
- [ ] Have consent forms printed and ready
- [ ] Have the **pre-survey Google Form link** ready to share
- [ ] Have the **post-survey Google Form link** ready to share
- [ ] Have a piece of paper/whiteboard ready for Disney Method (write their top 3)
- [ ] Brief your note-taker: timer starts when coding begins

---

## Phase 0: Welcome, Consent & Pre-Survey (0:00 – 0:10)

**SAY:**
> "Thanks for joining today. We're testing a VS Code extension called HelloCigen — an AI-powered project manager for collaborative coding sessions. Before we start, I need you to sign a consent form and fill out a short background survey. It takes about 5 minutes."

**DO:**
- Hand out consent forms — wait for all signatures before continuing
- Share the **pre-survey link** (paste in chat or show on screen)
- Give them 5 minutes to complete it silently
- While they fill it out, set up VS Code on their machines if needed

**AFTER PRE-SURVEY:**
> "Great. Now let me explain what we're doing today."

> "Today's goal is to **test this platform — not to finish a coding project.** We don't care if the code compiles at the end. We care about your experience using the tool. If something confuses you, that's useful data for us, not a failure."

> "A few ground rules:"

> "**1. Think aloud.** Narrate what you're thinking as you work — 'I'm not sure where to put this', 'I don't know what this button does.' Don't filter yourself."

> "**2. @AI is your project manager, not a coding assistant.** Think of it as a team lead who knows the project plan but won't write code for you. Use it for things like:
> - 'What should I work on next?'
> - 'Can you explain my task?'
> - 'How does my work connect to what others are doing?'
> - 'I'm not sure where to start — any guidance?'
>
> Coordination, planning, and task questions go to @AI."

> "**3. For actual coding — syntax, debugging, how-to — use your own tools.** Copilot, ChatGPT, whatever you normally use. Those are fine."

> "**4. We're recording screen and audio.** This is already covered in the consent form."

---

## Phase 1: Setup & Onboarding (0:10 – 0:15)

**DO:**
- Help each participant install the extension (.vsix file) if not already done
- Create the Live Share session — you are the host
- Have participants join the Live Share link
- Walk through the guest onboarding flow together (name + strengths/weaknesses form)

**SAY:**
> "Everyone fill in your name and a quick note about your strengths and weaknesses as a developer. This helps the AI divide tasks. Be honest — it matters."

**Once all guests are joined and profiles submitted:**
> "Good. Now the AI is going to look at our project and divide it into tasks."

---

## Phase 2: AI Task Division (0:15 – 0:20)

**DO:**
- Trigger the AI task division
- Give participants 1–2 minutes to read their assigned tasks silently

**SAY:**
> "Take a moment to read your assigned tasks. The AI divided the project based on the project description and your profiles."

**ASK:**
> "Does everyone understand their tasks? Any questions before we start?"

**REMIND:**
> "Remember — @AI for project questions, your own tools for coding. Focus on experiencing the platform, not racing to finish."

**DO NOT:**
- Ask evaluative questions about the task division — save for post-survey and discussion
- Intervene unless someone is genuinely confused about what their task means

---

## Phase 3: Coding Session (0:20 – 0:50)

**SAY:**
> "Go ahead and start working. Remember to think aloud. Try out @AI, check the task tracker, use the team chat — explore everything. I'll be here for technical issues but I won't interrupt."

---

**YOUR ROLE DURING CODING — stay silent unless:**
- There is a technical failure (server crash, chat down, task tracker broken)
- Someone has been completely stuck for more than 3 minutes

**If the tool breaks:**
Fix it quickly → note the timestamp → say "Sorry about that, please continue" → go quiet

**If someone asks @AI a coding question:**
> "For coding questions use your own tools — Copilot, ChatGPT, etc. @AI is for coordination, like 'what should I work on?' or 'how does my task relate to theirs?'"

**If someone is stuck for >3 min:**
> "What are you trying to do right now?" — gets them talking without evaluating

---

**AT 0:40 (10 min warning):**
> "About 10 minutes left. If there's a feature you haven't tried yet — @AI chat, task tracker, team chat — now's a good time."

**AT 0:48 (2 min warning):**
> "Let's wrap up in 2 minutes. Finish what you're doing and save your work."

---

## Phase 4: Post-Survey (0:50 – 0:58)

**SAY:**
> "Great work. Before we talk as a group, I need each of you to fill out a short survey individually. Please don't discuss with each other yet — answer based entirely on your own experience. Takes about 8 minutes."

**DO:**
- Share the **post-survey Google Form link** (paste in chat or display on screen)
- Start a timer for 8 minutes
- Stay quiet — do NOT look over their shoulders
- Note if anyone finishes very early or seems to rush

**AFTER SURVEY:**
> "Thank you. Now let's talk through the experience together."

---

## Phase 5: Group Discussion (0:58 – 1:18)

**SAY:**
> "I'll ask some questions, but this is a conversation — jump in whenever. Honest, critical feedback is the most valuable thing you can give us today. Being nice doesn't help."

---

### Step 1: Critical Moment Prompts (5 min)

**SAY:**
> "I'm going to ask about specific moments. Think back and share the first thing that comes to mind."

Ask one at a time — wait for all three to respond before moving on:

1. > "Think of a moment when the tool **helped** you. What happened?"
2. > "Think of a moment when you felt **confused or stuck**. What were you trying to do?"
3. > "Was there a moment you **ignored** something the tool suggested? Why?"

**Also probe if not already surfaced:**
- > "Any friction with the Live Share setup — editing conflicts, connection issues?"
- > "Did you use the team chat to talk to each other, or did you just speak out loud?"
- > "Did anything feel slow or broken?"

---

### Step 2: Disney Method Redesign Activity (15 min)

> **This is the most important part of the session.** The goal is to leave with 3 concrete, participant-generated redesign priorities for the next version.

**Before starting, assign roles** based on what you observed during coding:

| Role | Assign to | Their job |
|------|-----------|-----------|
| **Dreamer** | Most vocal / enthusiastic participant | No limits — imagine the ideal |
| **Realist** | Most pragmatic / execution-focused | What's actually buildable from that vision |
| **Critic** | Most frustrated / skeptical | What would still fail |

**INTRODUCE:**
> "For the next part, I'm going to give each of you a specific thinking role. [Name], you're the Dreamer. [Name], you're the Realist. [Name], you're the Critic. I'll explain what each means as we go."

---

**Round 1 — Dreamer (2–3 min):**

**SAY:**
> "[Dreamer's name] — no technical constraints, no budget limits, no 'that's too hard.' If HelloCigen could do absolutely anything to make today's session work better, what would it do? Dream big."

*Let them speak fully. Don't cut them off. Note the ideas.*

**If they're too conservative:**
> "Forget what's technically possible for a second — what would the ideal version look like?"

---

**Round 2 — Realist (2–3 min):**

**SAY:**
> "[Realist's name] — you heard the Dreamer. What from that vision could actually be built? What's the one change that would have the biggest impact on the experience we had today?"

*Let them respond to the Dreamer's ideas specifically — this creates productive dialogue.*

**If they're stuck:**
> "If you had to pick just one thing from what [Dreamer] said and make it real, what would it be?"

---

**Round 3 — Critic (2–3 min):**

**SAY:**
> "[Critic's name] — even if we built exactly what the Realist suggested, what would still be broken? What problem doesn't get solved?"

*This is where the most important friction surfaces. The Critic often names the core issue.*

**If they're too agreeable:**
> "Play devil's advocate — what's the biggest risk or flaw in this plan?"

---

**Round 4 — Open Group (5 min):**

**SAY:**
> "Let's build on this together. If we were releasing the next version of HelloCigen next month, what are the **three most important changes** to make? Let's agree on a list."

**Facilitate consensus — write the group's top 3 on paper, visible to everyone.**

**If they can't agree:**
> "Which change would have had the most impact on today's experience — start there."

*These 3 items become your "implications for design" section in the thesis.*

---

### Step 3: Closing (2 min)

**SAY:**
> "Last question: Would you use HelloCigen in a real team project? And if not — what would have to change first?"

*(Conditional framing — forces them to articulate the gap, not just say yes or no.)*

> "Anything we didn't cover that you want to mention?"

---

## Phase 6: Wrap-Up (1:18 – 1:22)

**SAY:**
> "Thank you so much — this is genuinely helpful. Your feedback will directly shape the next version of this platform."

**DO:**
- Stop screen recording
- Thank each participant individually

**AFTER EVERYONE LEAVES — do this immediately while fresh:**
- Export post-survey responses
- Write down your own observations: what surprised you, what broke, who seemed most frustrated, what the group agreed on
- Export MongoDB logs: @AI message history, task events, chat timestamps
- Debrief with your note-taker — compare what you each observed

---

## Quick Reference: Timing

| Phase | Activity | Time |
|-------|----------|------|
| 0 | Welcome + consent + pre-survey | 0:00 – 0:10 |
| 1 | Setup + onboarding (Live Share + guest profiles) | 0:10 – 0:15 |
| 2 | AI task division | 0:15 – 0:20 |
| 3 | Coding session | 0:20 – 0:50 |
| 4 | Post-survey (individual, silent) | 0:50 – 0:58 |
| 5a | Critical moment prompts | 0:58 – 1:03 |
| 5b | Disney Method — Dreamer | 1:03 – 1:06 |
| 5c | Disney Method — Realist | 1:06 – 1:09 |
| 5d | Disney Method — Critic | 1:09 – 1:12 |
| 5e | Disney Method — Open group top 3 | 1:12 – 1:17 |
| 5f | Closing | 1:17 – 1:19 |
| 6 | Wrap-up | 1:19 – 1:22 |

---

## Facilitation Tips

| Situation | What to say |
|-----------|-------------|
| One person dominates | "That's great — [other name], what was your take on that?" |
| Answers are vague | "Can you give me a specific moment when that happened?" |
| They're too polite | "Negative feedback helps us more than positive right now — be critical." |
| They go off-topic | "Interesting — let's come back to that. Going back to [topic]..." |
| Disney roles feel theatrical | Skip the role names — just say "I want each of you to think from a different angle" |
| Running over time | Cut the Critic round — Dreamer + Realist + Open Group are the minimum |
