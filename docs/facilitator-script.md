# Facilitator Script — Pilot Study

**Duration:** ~70 minutes | **Your role:** Facilitator (host of Live Share session)

---

## Pre-Session Setup (15-20 min before participants arrive)
- [ ] Start VS Code, load the project, run `npm run compile`
- [ ] Verify Express server starts (port 4000)
- [ ] Verify MongoDB connection is live
- [ ] Test @AI chat with a throwaway message
- [ ] Prepare the project prompt/description participants will work on
- [ ] Set up screen recording software
- [ ] Print notecards for individual reflection (3 copies)
- [ ] Have consent forms ready

---

## Phase 0: Welcome & Setup (0:00 - 0:10)

**SAY:**
> "Thanks for joining today. We're testing a VS Code extension called HelloCigen — an AI-powered project manager for collaborative coding. Today's goal is to **test this platform, not to finish a coding project.** We don't care if the code compiles at the end. We care about your experience using the tool."

> "Your job is to explore every feature, poke at things, and tell us what works and what doesn't. If something confuses you, that's useful data, not a failure."

> "A few ground rules:"

> "**1. Think aloud** — narrate what you're thinking as you code. For example, 'I'm looking for where to put this function' or 'I'm not sure what this button does.' Don't filter yourself."

> "**2. @AI is your project manager, not a coding assistant.** Think of it as a team lead who knows the project plan but won't write code for you. Ask it things like:
> - 'What should I work on next?'
> - 'Can you explain my task?'
> - 'How does my task connect to what others are doing?'
> - 'I'm stuck on where to start, any suggestions?'
>
> Basically — coordination, planning, and task questions go to @AI."

> "**3. For actual coding help — syntax, debugging, how-to — use your own tools.** Copilot, ChatGPT, whatever you normally use. Those are fair game."

> "**4. We're recording screen and audio.** The consent form covers this."

**DO:**
- Hand out consent forms, collect signatures
- Help each participant install the extension (.vsix file)
- Create the Live Share session (you are the host)
- Have participants join the Live Share link
- Walk through the onboarding flow together (guest profile form)

---

## Phase 1: AI Task Division (0:10 - 0:15)

**SAY:**
> "The AI is now going to analyze our project and divide it into tasks for each of you. Take a look at your assigned tasks."

**DO:**
- Trigger the task division
- Give participants 1-2 minutes to read their assignments
- Ask: "Does everyone understand their assigned tasks? Any questions before we start coding?"

**REMIND:**
> "Remember — @AI for project questions, your own tools for coding help. And focus on experiencing the platform, not racing to finish."

**DO NOT:**
- Ask evaluative questions ("Do you like how it divided tasks?") — save for discussion
- Intervene unless someone is genuinely stuck on setup

---

## Phase 2: Coding Session (0:15 - 0:45)

**SAY:**
> "Go ahead and start working. Remember to think aloud. Try out the @AI chat, check the task tracker, use the team chat — explore the platform. I'll be here if you have technical issues but I won't interrupt."

**YOUR ROLE DURING CODING:**
- Stay silent unless asked for help or there's a technical failure
- Monitor for critical bugs (server crash, chat not loading, task tracker broken)
- If the tool breaks: fix it quickly, note the timestamp, apologize briefly, let them continue
- Do NOT answer project/task questions — redirect: "Try asking that to @AI in the team chat"
- Do NOT offer coding help — let them use their own tools
- Note moments where participants seem confused but don't intervene

**IF SOMEONE ASKS @AI A CODING QUESTION:**
> Gently redirect: "For coding questions, use your own tools like Copilot or ChatGPT. @AI is for project coordination — like 'what should I do next?' or 'how does my task fit with others?'"

**IF SOMEONE IS STUCK (>3 min with no progress):**
> "What are you trying to do right now?" (get them talking, not evaluating)

**AT 0:35 (10 min warning):**
> "About 10 minutes left. If there's a feature of the platform you haven't tried yet — now's a good time."

**AT 0:43 (2 min warning):**
> "Let's wrap up in about 2 minutes — finish what you're doing and save your work."

---

## Phase 3: Transition (0:45 - 0:48)

**SAY:**
> "Great work everyone. Before we talk as a group, I want each of you to take 3 minutes and write down your thoughts on these cards."

**DO:**
- Hand out notecards with the 5 prompts (worked well / frustrated / missing / teammate awareness / wanted help but didn't get it)
- Set a timer for 3 minutes
- Stay quiet while they write

---

## Phase 4: Group Discussion (0:48 - 1:05)

**SAY:**
> "Let's talk through the experience together. I'll ask some questions but feel free to jump in anytime. Remember — honest feedback is the most helpful thing you can give us. Being critical is welcome."

### Step 1: Critical Moment Prompts (8-10 min)

**SAY:** "I'm going to ask about specific moments. Think back and share what comes to mind."

1. "Think of a moment when the tool **helped** you — what happened?"
2. "Think of a moment when you felt **confused or stuck** — what were you trying to do?"
3. "Think of a moment when you needed to **coordinate** with a teammate — how did you do it? Did you use the chat, talk verbally, or something else?"
4. "Was there a moment where you **ignored** something the tool suggested? Why?"

### Step 2: Feature-Specific Probes (8-10 min)

| | Feature | Question |
|---|---------|----------|
| **Joining** | Onboarding/Guest Flow | Was getting started clear? Where did you get stuck? |
| | Live Share | Any friction joining or editing together? |
| **Working** | AI Task Division | Did the task split make sense? What would you change? |
| | Task Fairness | Did your tasks match the strengths you entered? |
| | Task Tracker | Did you check it? Was it useful or ignorable? |
| | @AI Chat | Was @AI's advice actionable? Did you trust it? |
| | Human Chat | Did you use team chat, or just talk out loud? |
| | Collaboration Awareness | Did you know what teammates were doing? How? |
| | Information Findability | When you needed to know something, where did you look first? |
| **Overall** | AI as PM | Did it feel like a project manager or a chatbot? What's missing? |
| | Trust in AI | Did you feel comfortable disagreeing with the AI's decisions? |

### Step 3: Redesign Activity — Disney Method (5 min)

Assign roles right before this activity (based on what you observed during coding):
- **Dreamer** (assign to the most vocal participant): "Imagine the ideal version — no limits. What would this tool do?"
- **Realist** (assign to the most pragmatic participant): "What's actually buildable from that vision? What's the first step?"
- **Critic** (assign to the most frustrated participant): "What would still break? What's the biggest risk?"

Give each person 1 minute in their role, then open it up for group discussion.

### Closing (2 min)
- "Anything we didn't cover?"
- "Would you use this tool again in a real project? Why or why not?"

**FACILITATION TIPS:**
- If one person dominates: "That's great — [other name], what was your experience with that?"
- If answers are vague: "Can you give me a specific moment when that happened?"
- If they go off-topic: "Interesting — let's come back to that. Going back to [topic]..."
- If they're too polite: "It's okay to be critical — honest feedback helps us improve this"

---

## Phase 5: Wrap-Up (1:05 - 1:10)

**SAY:**
> "Thank you so much for your time. This feedback is incredibly valuable. Is there anything else you want to share before we wrap up?"

> "I'll send a short follow-up form later today — just a few quick ratings. Please fill it out while the experience is still fresh."

**DO:**
- Stop screen recording
- Collect notecards
- Thank participants
- Send post-session Google Form (Likert scales) same day
