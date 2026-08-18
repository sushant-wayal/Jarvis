# Jarvis V2 Capabilities & Interaction Guide
### Complete Reference: From Instant Fast-Path Queries to Autonomous Multi-Step Agent Goals

---

## 🌟 Overview

Jarvis V2 is your **Personal Operating Layer and Autonomous Agent**. Whether you are speaking into your phone, wearing Bluetooth earbuds, or typing in the app, Jarvis adapts its response style, tracks your working state, recalls your personal preferences, and executes single or multi-step tool workflows.

Here is the complete spectrum of what you can ask Jarvis, categorized from **Tier 1 (Instant / Simple)** to **Tier 6 (Autonomous Agent / Complex)**.

---

## Tier 1: Instant Answers & Fast-Path Tools (Sub-1s Response)

Jarvis bypasses secondary LLM loops for deterministic calculations and lookups, delivering sub-second voice responses.

| Category | Example Prompts | What Jarvis Does Behind the Scenes |
| :--- | :--- | :--- |
| **Arithmetic & Math** | *"What is 125 multiplied by 8?"*<br>*"What is 49 into 193?"*<br>*"Calculate 18% GST on 45,000"* | Evaluates math in single-turn fast path; outputs exact number instantly. |
| **Time & Timezones** | *"What time is it in Tokyo right now?"*<br>*"What's the current time in London?"*<br>*"What day is it today?"* | Queries IANA world clocks and formats current local time. |
| **Date Calculations** | *"How many days until Friday?"*<br>*"What is today's full date?"* | Computes exact date deltas relative to your active timezone. |
| **Live Weather** | *"What's the weather in Mumbai?"*<br>*"Is it raining in London?"*<br>*"Do I need an umbrella today?"* | Fetches live Open-Meteo temperature, precipitation, and conditions. |

---

## Tier 2: Personal Memory & Knowledge Management

Jarvis persistently learns your habits, preferences, and personal facts without cluttering conversation history.

| Capability | Example Prompts | What Jarvis Does |
| :--- | :--- | :--- |
| **Explicit Memory Storage** | *"Jarvis, remember that I prefer black coffee with no sugar."*<br>*"Note down that my car number is MH-12-AB-1234."* | Stores memory with high confidence (`1.0`) and category (`PREFERENCE` / `FACT`). |
| **Memory Recall** | *"What kind of coffee do I like?"*<br>*"What is my car number?"* | Performs vector/semantic lookup in your personal memory vault and answers immediately. |
| **Preference Updates & Conflicts** | *"Actually Jarvis, I now prefer cappuccino over black coffee."* | Detects topic overlap, resolves contradiction, and updates existing memory record. |
| **Memory Inspection** | Open the **Memories Tab** in mobile app | View, search, filter by type (`FACT`, `PREFERENCE`, `PROJECT`, `GOAL`), or delete anytime. |

---

## Tier 3: Task & Reminder Management

Jarvis manages your schedule, reminders, and background routines independently of whether your phone screen is active.

| Task Type | Example Prompts | What Jarvis Does |
| :--- | :--- | :--- |
| **One-Time Reminders** | *"Remind me tomorrow at 8 AM to call Mom."*<br>*"Remind me in 45 minutes to stretch."* | Parses natural date/time, stores a durable `Task` in PostgreSQL, and schedules next run. |
| **Routine & Recurring Tasks** | *"Every Monday at 9 AM, remind me to review sprint goals."* | Creates recurring routine with automatic recurrence step. |
| **Task Status Lookups** | *"What tasks do I have scheduled for today?"*<br>*"Show my active reminders."* | Queries active database tasks and summarizes them concisely. |
| **Managing via UI** | Open the **Tasks Tab** in mobile app | Check off completed tasks, toggle active states, or delete items with one tap. |

---

## Tier 4: Live Web Search & Entity Lookups

When fresh, external real-world knowledge is required, Jarvis queries live web sources.

| Query Type | Example Prompts | What Jarvis Does |
| :--- | :--- | :--- |
| **Live News & Events** | *"Who won the cricket match yesterday?"*<br>*"What is the latest news on SpaceX Starship launch?"* | Invokes `web_search` tool, extracts live snippets, and synthesizes a concise factual summary. |
| **Technical & Fact Lookups** | *"What is the latest LTS version of Node.js?"*<br>*"Who is the current CEO of Microsoft?"* | Queries up-to-date web indexes rather than relying on stale model training data. |

---

## Tier 5: Contextual Multi-Turn Conversation & Follow-Ups

Jarvis maintains context across multiple conversation turns, understanding pronouns, references, and implicit topics.

### Example Conversation:
```text
User: "Find top-rated vegetarian restaurants in Bandra."
Jarvis: "I found three great spots: Bastian, Sequel, and Farmer's Cafe."

User: "Which one is closest to the sea?"
Jarvis: "Bastian is closest to the coast."

User: "Remind me at 7 PM to check their menu."
Jarvis: "Done. I've set a reminder for 7 PM to check Bastian's menu."
```
*Notice how Jarvis understood what "one" referred to and carried the selected restaurant into the reminder creation.*

---

## Tier 6: Autonomous Multi-Step Agentic Goals (The V2 Superpower)

The hallmark of Jarvis V2 is executing **multi-step ReAct plans** (`Plan → Tool → Observe → Continue/Finish`) to satisfy compound, real-world requests.

### 1. Conditional Weather & Reminder Automation
> **Prompt:** *"Check tomorrow's weather in Mumbai, and if it's going to rain, set a reminder for 7 AM to carry an umbrella."*
* **Step 1:** Jarvis invokes `weather` for Mumbai.
* **Step 2:** Jarvis inspects precipitation probability (`80% rain showers`).
* **Step 3:** Condition evaluates true → Jarvis invokes `task_create` for tomorrow at 7:00 AM.
* **Step 4:** Jarvis responds: *"Tomorrow shows an 80% chance of rain in Mumbai. I've set a reminder for 7 AM to carry an umbrella."*

---

### 2. Research, Preference Storage & Travel Planning
> **Prompt:** *"Plan a 3-day weekend itinerary for Goa. Remember that I prefer beachfront stays, and set a reminder for Friday at 6 PM to book tickets."*
* **Step 1:** Jarvis invokes `memory_create` to store your beachfront preference.
* **Step 2:** Jarvis searches/synthesizes a 3-day itinerary centered on beachfront locations in Goa.
* **Step 3:** Jarvis invokes `task_create` scheduled for Friday 6:00 PM.
* **Step 4:** Jarvis presents the crisp itinerary and confirms task creation in one seamless response.

---

### 3. High-Risk Action Confirmation
> **Prompt:** *"Delete all tasks in my work project."*
* **Step 1:** Agent planner flags tool execution as `HIGH_RISK`.
* **Step 2:** Status shifts to `WAITING_FOR_USER` and displays the interactive **ConfirmationModal** on mobile.
* **Step 3:** Only executes upon explicit user approval (`[Approve & Execute]`).

---

## 🎯 Summary Matrix: How to Talk to Jarvis

| If you want to... | Say something like... | Mode |
| :--- | :--- | :--- |
| **Calculate something fast** | *"What is 25 percent of 4,80,000?"* | Instant (<1s) |
| **Know the time elsewhere** | *"What time is it in New York?"* | Instant (<1s) |
| **Teach Jarvis about yourself** | *"Remember that my passport expires in November 2028."* | Memory V2 |
| **Recall what Jarvis knows** | *"When does my passport expire?"* | Memory V2 |
| **Never forget a chore** | *"Remind me at 8 PM tonight to submit the electricity bill."* | Task Engine |
| **Look up real-time facts** | *"What's the score in the ongoing football game?"* | Web Search |
| **Combine tasks together** | *"Find the weather in Pune and remind me at 6 PM if I need a jacket."* | Multi-Step Agent |
