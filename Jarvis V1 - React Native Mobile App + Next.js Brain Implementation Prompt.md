# Jarvis V1: Mobile App + Jarvis Brain

You are building **Jarvis**, a personal AI assistant designed to be accessible from anywhere through a mobile device and ordinary Bluetooth earbuds.

The goal of V1 is to build a **real, working end-to-end assistant**, not a mockup.

## 1. Core Architecture

Build two applications:

### A. Jarvis Mobile
Technology:
- React Native
- Expo
- TypeScript
- Expo Router
- Modern React Native architecture
- Clean component architecture
- Secure local storage
- Audio recording/playback
- Background-capable architecture where realistically supported by iOS/Android

The mobile app is primarily:

**User ↔ Phone ↔ Jarvis Backend**

It should also act as the bridge between the user's phone and normal Bluetooth earbuds.

Do NOT modify or manufacture custom earbud hardware.

The system must work with ordinary Bluetooth earbuds that already support microphone + audio output.

### B. Jarvis Brain
Technology:
- Next.js
- TypeScript
- App Router
- API routes / route handlers
- Deployable to Vercel
- PostgreSQL-compatible database
- Prisma ORM
- Modular service architecture

The backend is the actual Jarvis brain.

The backend should contain:
- Conversation handling
- AI orchestration
- Memory
- Tool execution
- User context
- Intent detection
- Response generation
- Conversation persistence
- Future agent/tool extensibility

The mobile application must NOT contain core business logic.

---

# 2. V1 Objective

The first successful flow must be:

1. User opens Jarvis mobile app.
2. User taps the microphone button.
3. Phone records the user's voice.
4. Audio is sent to the Jarvis backend.
5. Backend converts speech to text.
6. Backend processes the request through the Jarvis brain.
7. Jarvis determines whether it needs a tool.
8. Tool executes if required.
9. Jarvis generates a concise response.
10. Backend optionally converts response to speech.
11. Mobile app receives response.
12. Response is spoken through the phone/connected Bluetooth earbuds.
13. Conversation appears in the app.

Example:

User:
> "Hey Jarvis, what's the weather today?"

Flow:

```text
Microphone
    ↓
React Native
    ↓
POST /api/voice
    ↓
Speech-to-Text
    ↓
Jarvis Brain
    ↓
Weather Tool
    ↓
LLM
    ↓
Text Response
    ↓
Text-to-Speech
    ↓
React Native
    ↓
Bluetooth Earbuds
```

This entire loop must actually work.

---

# 3. Important Product Philosophy

Jarvis should feel like an **assistant**, not a chatbot.

The architecture must support:

- Natural voice interaction
- Short responses
- Context awareness
- Persistent memory
- Tool execution
- Personalization
- Proactive actions later
- Mobile + earbud accessibility
- Future wake-word activation
- Future background operation

But do not implement every futuristic feature badly in V1.

Build solid foundations.

---

# 4. Repository Structure

Prefer a monorepo:

```text
jarvis/
│
├── apps/
│   ├── mobile/
│   └── brain/
│
├── packages/
│   ├── shared/
│   ├── types/
│   ├── config/
│   └── ai/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── tools.md
│   └── development.md
│
├── .agents/
│   ├── AGENTS.md
│   └── skills/
│
├── package.json
├── README.md
└── ...
```

If a monorepo introduces unnecessary complexity for the current environment, keep the two applications as clearly separated projects but maintain identical architectural boundaries.

---

# 5. Mobile App

## Main Screens

Create these screens.

### Home

The primary Jarvis interface.

Include:

- Jarvis status
- Large microphone button
- Current conversation
- Listening state
- Processing state
- Speaking state
- Error state
- Connection state

States:

```text
IDLE
LISTENING
PROCESSING
THINKING
SPEAKING
ERROR
OFFLINE
```

The UI should clearly communicate these states.

Do not create a generic ChatGPT clone.

The main interaction should be voice-first.

---

# 6. Conversation Screen

Display:

- User messages
- Jarvis messages
- Timestamp
- Voice/text indicator
- Tool activity where useful
- Loading/thinking state

Example:

```text
You
What's on my calendar today?

Jarvis
You have 3 events today.
Your first meeting starts at 10:00 AM.
```

Keep responses concise.

---

# 7. Text Input

Although Jarvis is voice-first, provide text input.

User should be able to:

- Type a message
- Send it
- Receive Jarvis response
- Have the response optionally spoken aloud

This makes development/testing much easier.

---

# 8. Voice Interaction

Implement:

### Recording

Use a reliable React Native/Expo-compatible audio recording solution.

Requirements:

- Start recording
- Stop recording
- Cancel recording
- Permission handling
- Audio level UI if available
- Maximum recording duration
- Error recovery

Do not upload audio continuously in V1.

Use:

```text
Tap → Record → Stop → Upload
```

This is much more reliable for the first version.

---

# 9. Bluetooth Earbuds

The app should work with standard Bluetooth audio devices.

Do not attempt to directly control proprietary earbud firmware.

The operating system should handle:

```text
Phone
 ↕
Bluetooth
 ↕
Normal Earbuds
```

The app simply:

- Uses the phone microphone/audio system
- Plays TTS through the current audio output
- Handles normal Bluetooth routing automatically

Design the architecture so a future version can support:

- Background listening
- Headset button actions
- Bluetooth events
- Wearable integrations
- Wake-word activation

But don't fake unsupported OS capabilities.

---

# 10. Backend API

Create clean versioned APIs.

Example:

```text
/api/v1/health
/api/v1/chat
/api/v1/voice
/api/v1/conversations
/api/v1/memory
/api/v1/tools
/api/v1/user
```

Use request validation with Zod.

Every API should have:

- Input validation
- Authentication boundary
- Error handling
- Logging
- Request IDs
- Consistent response format

Example:

```ts
{
  success: true,
  data: {...},
  error: null,
  requestId: "..."
}
```

Errors:

```ts
{
  success: false,
  data: null,
  error: {
    code: "VOICE_PROCESSING_FAILED",
    message: "Unable to process audio"
  },
  requestId: "..."
}
```

---

# 11. Jarvis Brain Architecture

Do NOT put everything into one API route.

Use layers:

```text
API Layer
   ↓
Request/Conversation Service
   ↓
Intent / Brain Orchestrator
   ↓
Memory Service
   ↓
Tool Registry
   ↓
Tool Execution
   ↓
LLM
   ↓
Response Formatter
```

Recommended structure:

```text
src/
├── app/
│   └── api/
│
├── modules/
│   ├── brain/
│   │   ├── orchestrator.ts
│   │   ├── planner.ts
│   │   ├── responder.ts
│   │   └── types.ts
│   │
│   ├── conversation/
│   ├── memory/
│   ├── voice/
│   ├── tools/
│   ├── users/
│   └── auth/
│
├── lib/
│   ├── ai/
│   ├── db/
│   ├── logging/
│   └── validation/
│
└── config/
```

Keep individual files small.

Prefer multiple focused modules over giant files.

Target roughly:

**100-250 lines per file where practical.**

If a file becomes too large, split it by responsibility.

---

# 12. Brain Orchestrator

The brain should not simply send every message directly to an LLM.

Implement a basic orchestration pipeline:

```text
Incoming Request
       ↓
Identify User
       ↓
Load Recent Conversation
       ↓
Retrieve Relevant Memory
       ↓
Determine Intent
       ↓
Determine Required Tools
       ↓
Execute Tools
       ↓
Generate Final Response
       ↓
Store Conversation
       ↓
Update Memory
       ↓
Return Response
```

The orchestrator should be deterministic where possible.

---

# 13. Jarvis Personality

Jarvis should be:

- Intelligent
- Concise
- Calm
- Helpful
- Slightly witty
- Context-aware
- Action-oriented

Avoid:

- Huge explanations
- Repeating the user
- Generic AI disclaimers
- Excessive emojis
- "As an AI..."
- Overly enthusiastic responses

For voice interaction especially:

**Keep responses short.**

Example:

User:
> "What's the weather?"

Jarvis:

> "It's 27 degrees with light rain. Take an umbrella."

Not:

> "Certainly! I'd be happy to help you with today's weather..."

---

# 14. Conversation Memory

Create persistent conversations.

Database entities should include at minimum:

### User

```text
id
name
createdAt
updatedAt
preferences
```

### Conversation

```text
id
userId
title
createdAt
updatedAt
```

### Message

```text
id
conversationId
role
content
inputType
createdAt
metadata
```

Roles:

```text
USER
ASSISTANT
SYSTEM
TOOL
```

Input types:

```text
TEXT
VOICE
```

---

# 15. Long-Term Memory

Create a dedicated memory system.

Memory types:

```text
FACT
PREFERENCE
PERSON
PROJECT
ROUTINE
CONTEXT
```

Each memory should contain:

```text
id
userId
type
content
importance
createdAt
updatedAt
```

Example:

```text
User prefers concise answers.
```

Jarvis should be able to retrieve relevant memories before generating a response.

Do not blindly inject the entire memory database into every prompt.

Use relevance + importance.

---

# 16. Memory Extraction

After a conversation, determine whether anything should become long-term memory.

Examples:

User:
> "I prefer to be called Sushant."

Store it.

User:
> "I'm going to the gym tomorrow."

Do NOT necessarily store it permanently.

The memory system must distinguish:

```text
Temporary context
vs
Long-term user information
```

---

# 17. Tool System

Build a proper tool registry.

Example:

```ts
interface JarvisTool {
  name: string
  description: string
  inputSchema: ZodSchema
  execute(input: unknown, context: ToolContext): Promise<ToolResult>
}
```

Register tools centrally.

Example:

```text
tools/
├── registry.ts
├── calculator.ts
├── current-time.ts
├── weather.ts
└── ...
```

The brain should dynamically decide whether a tool is required.

---

# 18. V1 Tools

Implement these first.

## Calculator

Examples:

```text
"What is 1836100 / 12?"
"Calculate 15% of 85000."
```

## Current Time

Support:

```text
"What time is it?"
"What time is it in London?"
```

## Weather

Implement through a clean provider abstraction.

Example:

```ts
WeatherProvider
```

Do not tightly couple the brain to one weather provider.

## Date/Time

Support:

```text
"What's today's date?"
"How many days until Friday?"
```

## Basic Web Search

Create a provider abstraction for web search.

Jarvis should be able to answer current-information queries using search when required.

Keep the provider replaceable.

---

# 19. Tool Execution Rules

The LLM should not directly execute arbitrary code.

Tools must be explicitly registered.

Flow:

```text
LLM decides:
"I need weather"

       ↓

Tool Registry

       ↓

Weather Tool

       ↓

Validated Input

       ↓

Execution

       ↓

Tool Result

       ↓

LLM

       ↓

Final Response
```

Never allow arbitrary tool execution from user-generated strings.

---

# 20. Voice Pipeline

Create provider abstractions.

### Speech-to-Text

```ts
interface SpeechToTextProvider {
  transcribe(audio: Buffer): Promise<TranscriptionResult>
}
```

### Text-to-Speech

```ts
interface TextToSpeechProvider {
  synthesize(text: string): Promise<AudioResult>
}
```

Do not hard-code the entire application to one AI vendor.

The actual provider should be configurable through environment variables.

---

# 21. AI Provider Architecture

Create:

```text
AIProvider
SpeechToTextProvider
TextToSpeechProvider
EmbeddingProvider
SearchProvider
```

Example:

```ts
interface AIProvider {
  generate(...)
  stream(...)
}
```

The brain should communicate with providers through these interfaces.

This allows providers to be changed later without rewriting Jarvis.

---

# 22. Streaming

For text responses, support streaming if the selected LLM provider allows it.

Mobile should be able to receive:

```text
THINKING
↓
STREAMING RESPONSE
↓
FINAL RESPONSE
```

However, do not sacrifice reliability for streaming.

Voice can remain:

```text
Record
→ Upload
→ Process
→ Complete TTS
→ Play
```

for V1.

---

# 23. Authentication

Implement proper authentication boundaries.

V1 can use a simple authentication mechanism suitable for a personal application, but structure the system so it can later support:

- OAuth
- Passkeys
- Multiple devices
- Multiple users

Never put permanent secrets inside the React Native app.

The mobile application must never contain:

```text
LLM API keys
Database credentials
Search API keys
TTS/STT provider secrets
```

All provider secrets stay on the backend.

---

# 24. Environment Variables

Create:

```text
.env.example
```

Document every variable.

Separate:

```text
PUBLIC / MOBILE CONFIG
SERVER-ONLY SECRETS
```

Never expose server secrets through Next.js public environment variables.

---

# 25. Database

Use PostgreSQL + Prisma.

Create migrations.

The schema should support:

```text
User
Conversation
Message
Memory
ToolExecution
Device
```

A Device entity should prepare for future multi-device support.

Example:

```text
Device
- id
- userId
- name
- platform
- appVersion
- lastSeenAt
- createdAt
```

---

# 26. Tool Execution Logging

Store tool execution metadata.

Example:

```text
ToolExecution
- id
- conversationId
- toolName
- input
- output
- status
- durationMs
- createdAt
```

Do not store sensitive information unnecessarily.

The purpose is debugging and observability.

---

# 27. Observability

Implement structured logging.

Every request should have:

```text
requestId
userId
conversationId
duration
status
```

Log:

- API errors
- AI failures
- Tool failures
- STT failures
- TTS failures
- Database failures

Never log:

- API keys
- passwords
- authentication tokens
- raw sensitive personal data unnecessarily

---

# 28. Error Handling

The assistant must fail gracefully.

Examples:

### No Internet

Mobile:

> "No connection. I'll need internet access for that."

### AI failure

> "I couldn't process that right now."

### Speech recognition failure

> "I didn't catch that."

### Tool failure

> "I couldn't get that information right now."

Never expose raw stack traces to the user.

---

# 29. Mobile Offline Handling

Implement basic offline awareness.

The app should detect:

```text
ONLINE
OFFLINE
```

When offline:

- Allow UI to remain usable
- Show offline state
- Do not attempt impossible API calls repeatedly
- Preserve unsent text where reasonable

Do not attempt to build a fully offline LLM in V1.

---

# 30. Settings

Create a settings screen.

Include:

### Profile

- Name
- Preferred response style

### Voice

- Voice selection
- Speech speed if supported
- Auto-speak toggle

### Assistant

- Enable/disable voice responses
- Conversation history

### Connectivity

- Backend status
- App version

### Privacy

- Clear conversations
- Clear memories
- Clear local data

---

# 31. Conversation Management

Support:

- New conversation
- Continue conversation
- Delete conversation
- Conversation list
- Conversation title

Automatically generate a short conversation title from the first meaningful interaction.

---

# 32. Backend Health

Implement:

```text
GET /api/v1/health
```

Return:

```text
database
AI provider
STT provider
TTS provider
overall status
```

Mobile should display backend connectivity.

---

# 33. Security

Implement:

- Zod validation
- Authentication
- Authorization
- Rate limiting abstraction
- Request size limits
- Audio upload limits
- Input sanitization
- Server-side secret protection

Do not trust the mobile client.

Every user-specific backend operation must verify ownership.

---

# 34. Prompt Architecture

Do not place the entire Jarvis system prompt inside one giant string.

Create structured prompt components:

```text
system/
├── identity.ts
├── personality.ts
├── behavior.ts
├── safety.ts
├── tool-rules.ts
└── memory.ts
```

Compose them at runtime.

This makes the brain easier to evolve.

---

# 35. Brain Context

The LLM context should be structured approximately as:

```text
SYSTEM
Jarvis identity + behavior

USER PROFILE
Relevant user information

MEMORY
Relevant long-term memories

CONVERSATION
Recent messages

TOOLS
Available tools

CURRENT REQUEST
User's current request
```

Do not blindly send the entire conversation forever.

Implement a context window strategy.

---

# 36. Context Compression

When conversations become long:

```text
Recent messages
+
Conversation summary
+
Relevant memories
```

instead of sending every historical message.

Implement the abstraction now even if aggressive summarization is initially simple.

---

# 37. Response Contract

The brain should internally produce structured results.

Example:

```ts
{
  text: string,
  shouldSpeak: boolean,
  toolCalls: ToolCall[],
  metadata: {
    conversationId: string,
    requestId: string
  }
}
```

Mobile should not need to understand the internal AI architecture.

---

# 38. Voice Response Contract

For voice requests:

```ts
{
  transcript: string,
  response: string,
  audioUrl?: string,
  conversationId: string
}
```

Prefer temporary/expiring audio URLs or secure streaming.

Do not permanently store generated audio unless required.

---

# 39. UI Design

Design Jarvis as a futuristic but usable assistant.

Avoid:

- Excessive glowing effects
- Overloaded dashboards
- Fake holographic UI
- Giant unnecessary animations
- Generic AI gradients everywhere

The interface should feel:

**minimal + intelligent + personal + voice-first**

Main screen should prioritize:

```text
        Jarvis status

           ◉

      Tap to speak

     "Listening..."
```

Conversation history should remain secondary.

---

# 40. Animations

Implement subtle states:

### Idle

Small breathing animation.

### Listening

Audio-reactive or pulsing microphone.

### Thinking

Subtle processing animation.

### Speaking

Voice waveform/pulse.

Keep animations performant.

Respect reduced-motion accessibility settings.

---

# 41. Accessibility

Implement:

- Screen reader labels
- Sufficient contrast
- Large touch targets
- Dynamic font support where practical
- Reduced motion
- Clear state announcements

---

# 42. Performance

Mobile:

- Avoid unnecessary rerenders
- Use FlatList for conversations
- Compress audio appropriately
- Avoid huge local state objects
- Cancel abandoned requests
- Handle app lifecycle correctly

Backend:

- Avoid unnecessary database queries
- Avoid loading all memories
- Cache where appropriate
- Keep API responses small
- Use streaming where useful

---

# 43. Testing

Create tests for:

### Backend

- API validation
- Authentication
- Brain orchestration
- Memory retrieval
- Tool registry
- Calculator
- Date/time
- Tool failures
- AI provider failures
- Database operations

### Mobile

- Home screen
- Recording state
- Conversation rendering
- API failure
- Offline state
- Settings

At minimum, test the complete happy path:

```text
Text request
→ Brain
→ Tool
→ Response
```

and:

```text
Voice request
→ STT
→ Brain
→ TTS
→ Mobile playback
```

---

# 44. End-to-End Development Order

Do NOT build everything simultaneously.

Follow this sequence.

## Phase 1: Foundation

- Create repository
- Setup mobile
- Setup Next.js backend
- Setup TypeScript
- Setup linting
- Setup formatting
- Setup environment configuration
- Setup shared types
- Setup Prisma
- Setup PostgreSQL
- Setup basic authentication boundary

## Phase 2: Text Brain

Implement:

```text
Mobile text input
→ POST /api/v1/chat
→ Brain
→ LLM
→ Response
→ Mobile
```

This must work before voice.

## Phase 3: Conversations

Add:

- Conversation creation
- Message persistence
- Conversation history
- Titles
- Delete

## Phase 4: Tool System

Implement:

- Tool registry
- Calculator
- Date/time
- Weather
- Search

Test each independently.

## Phase 5: Memory

Implement:

- Memory storage
- Memory extraction
- Memory retrieval
- Memory deletion
- Memory relevance

## Phase 6: Voice

Implement:

```text
Mobile recording
→ Backend upload
→ STT
→ Brain
→ TTS
→ Mobile playback
```

## Phase 7: Earbuds

Verify the exact same voice flow works while:

- Bluetooth earbuds are connected
- Earbud microphone is selected by OS
- Earbud speaker is selected by OS

Do not build custom Bluetooth logic unless technically necessary.

## Phase 8: Polish

Add:

- Animations
- Error states
- Offline states
- Settings
- Accessibility
- Logging
- Performance optimization

---

# 45. V1 Features That Must Work

Before declaring V1 complete, verify:

- [ ] User can open Jarvis
- [ ] User can type a message
- [ ] Jarvis responds
- [ ] Conversations persist
- [ ] User can start a new conversation
- [ ] User can view old conversations
- [ ] User can delete conversations
- [ ] User can record voice
- [ ] Voice is transcribed
- [ ] Jarvis processes voice requests
- [ ] Jarvis can speak responses
- [ ] Spoken response plays through normal Bluetooth earbuds
- [ ] Calculator works
- [ ] Date/time works
- [ ] Weather works
- [ ] Search works
- [ ] Jarvis remembers useful long-term information
- [ ] User can delete memories
- [ ] Authentication boundary exists
- [ ] API keys remain server-side
- [ ] Backend health endpoint works
- [ ] Errors are handled gracefully
- [ ] Logs are structured
- [ ] Database migrations work
- [ ] Production deployment works

---

# 46. Features to Architect for, But NOT Fully Build in V1

Prepare clean extension points for:

### Wake Word

Future:

```text
"Hey Jarvis"
```

→ Begin listening.

Do not fake always-listening functionality if the OS does not permit it reliably.

### Background Assistant

Future:

```text
Phone locked
+
Earbuds connected
+
Wake word
→ Jarvis
```

### Proactive Jarvis

Future:

```text
Jarvis notices something
→ Sends notification
```

Examples:

- Upcoming meeting
- Important reminder
- Travel information
- Weather
- Personal routines

### Calendar

Future tool:

```text
calendar.list()
calendar.create()
calendar.update()
```

### Reminders

Future:

```text
reminder.create()
reminder.list()
```

### Email

Future:

```text
email.search()
email.read()
email.draft()
```

### Messages

Future integrations.

### Location

Future location-aware tools.

### Smart Home

Future tool architecture.

### Multi-device

Future:

```text
Phone
Laptop
Earbuds
Watch
Web
```

all connected to the same Jarvis brain.

---

# 47. Important Architectural Rule

The brain must be device-independent.

Do NOT write:

```text
if mobile then ...
```

inside the core intelligence.

Instead:

```text
Client
   ↓
Jarvis API
   ↓
Brain
   ↓
Tools
```

Any future client should be able to connect:

```text
React Native
Web
Desktop
Watch
Earbud interface
```

The backend should not care.

---

# 48. Tool Context

Every tool should receive a context object:

```ts
interface ToolContext {
  userId: string
  conversationId: string
  requestId: string
  timezone: string
  locale: string
}
```

This allows future tools to become personalized.

---

# 49. Timezone

Do not assume UTC for user-facing time.

Store timestamps consistently, preferably UTC.

Convert to the user's configured timezone when presenting information.

Allow the user's timezone to be stored in profile/settings.

---

# 50. API Documentation

Create:

```text
docs/api.md
```

Document:

- Endpoint
- Method
- Request
- Response
- Authentication
- Errors

Also document:

```text
docs/tools.md
```

with every available Jarvis tool.

---

# 51. README

Create a useful README containing:

- What Jarvis is
- Architecture
- Repository structure
- Local setup
- Environment variables
- Database setup
- Running mobile
- Running backend
- Testing
- Deployment
- Future roadmap

Do not write marketing fluff.

---

# 52. Agent Instructions

Create `.agents/AGENTS.md`.

It must contain these rules:

1. Preserve existing functionality.
2. Never create unnecessarily large files.
3. Prefer small focused modules.
4. Do not duplicate logic.
5. Keep business logic outside UI components.
6. Keep secrets server-side.
7. Validate external input.
8. Use TypeScript strictly.
9. Avoid `any` unless genuinely necessary.
10. Write tests for important business logic.
11. Run linting after changes.
12. Run type checking after changes.
13. Fix ALL lint errors.
14. Fix ALL lint warnings.
15. Do not leave TypeScript errors.
16. Do not leave TODOs for functionality that was explicitly requested.
17. Do not silently remove existing features.
18. Keep APIs backward compatible when possible.
19. Document architectural decisions.
20. Prefer composition over giant components/services.
21. Never put the entire Jarvis brain inside a single route handler.
22. Never expose provider API keys to the mobile client.
23. Never trust client-provided user IDs without authentication/authorization.
24. Do not implement fake functionality just to make a UI appear complete.
25. If a platform limitation prevents a feature, implement the correct abstraction and document the limitation.

---

# 53. Code Quality Requirements

The final project must have:

```text
TypeScript strict mode
ESLint clean
No lint warnings
No lint errors
No TypeScript errors
No unused imports
No dead code
No duplicated business logic
No hardcoded secrets
No giant components
No giant route handlers
```

Run:

```text
lint
typecheck
test
build
```

before declaring a phase complete.

---

# 54. Development Method

Work incrementally.

After each phase:

1. Implement.
2. Run tests.
3. Run lint.
4. Run typecheck.
5. Run build.
6. Fix all issues.
7. Verify manually.
8. Update documentation.
9. Only then move to the next phase.

Do not generate the entire application blindly in one pass.

---

# 55. Environment Configuration

Create separate configurations for:

```text
development
test
production
```

Never commit:

```text
.env
.env.local
API keys
database credentials
tokens
```

Commit:

```text
.env.example
```

---

# 56. Production Deployment

Backend:

```text
Next.js
→ Vercel
→ PostgreSQL
```

Mobile:

```text
Expo
→ Development build
→ Android/iOS
```

The production backend URL must be configurable in the mobile application.

Do not hardcode localhost.

---

# 57. Final Acceptance Test

Perform this exact test.

### Test 1

Open app.

Tap microphone.

Say:

> "What is 15 percent of 2000?"

Expected:

```text
Jarvis:
"300."
```

### Test 2

Say:

> "What's the weather today?"

Expected:

```text
STT
→ Weather Tool
→ Jarvis
→ TTS
→ Earbuds
```

### Test 3

Say:

> "Remember that I prefer concise answers."

Then start a new conversation and ask:

> "How should you answer me?"

Jarvis should use the stored preference.

### Test 4

Close the app.

Reopen.

Conversation history should remain.

### Test 5

Connect Bluetooth earbuds.

Repeat the voice request.

The response should play through the earbuds.

### Test 6

Disable internet.

Attempt a request.

The app should show a clean offline/error state instead of exploding spectacularly like a Victorian machine.

---

# 58. Final Architecture

The final V1 should approximately look like:

```text
                 ┌───────────────────┐
                 │   Normal Earbuds  │
                 │ Mic + Speaker     │
                 └─────────┬─────────┘
                           │
                       Bluetooth
                           │
                 ┌─────────▼─────────┐
                 │   React Native    │
                 │      Mobile       │
                 │                   │
                 │ Voice             │
                 │ Text              │
                 │ UI                │
                 │ Audio Playback    │
                 └─────────┬─────────┘
                           │ HTTPS
                           │
                 ┌─────────▼─────────┐
                 │   Next.js API     │
                 │                   │
                 │ Auth              │
                 │ Validation        │
                 │ Voice Pipeline    │
                 └─────────┬─────────┘
                           │
                 ┌─────────▼─────────┐
                 │   Jarvis Brain    │
                 │                   │
                 │ Context           │
                 │ Memory            │
                 │ Planning          │
                 │ Tool Selection    │
                 │ Response          │
                 └──────┬───────┬────┘
                        │       │
              ┌─────────▼─┐   ┌─▼──────────┐
              │ AI Models │   │ Tool Layer │
              └───────────┘   └─────┬──────┘
                                     │
                       ┌─────────────┼─────────────┐
                       │             │             │
                  Calculator      Weather       Search
                       │             │             │
                       └─────────────┼─────────────┘
                                     │
                              ┌──────▼──────┐
                              │ PostgreSQL  │
                              │             │
                              │ Users       │
                              │ Messages    │
                              │ Memories    │
                              │ Tools       │
                              └─────────────┘
```

# 59. Most Important Rule

Build **a functioning Jarvis loop before adding futuristic features**.

The priority order is:

```text
VOICE
  ↓
BRAIN
  ↓
TOOLS
  ↓
MEMORY
  ↓
TTS
  ↓
EARBUDS
  ↓
POLISH
```

When V1 is complete, Jarvis should already feel like a real assistant:

**You speak → Jarvis understands → Jarvis thinks → Jarvis acts → Jarvis speaks back.**

Everything after that is an upgrade to the brain, not a rewrite of the body.