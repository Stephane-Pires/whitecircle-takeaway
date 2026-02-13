# Architecture

## FRONTEND

```mermaid
graph TD
    RootLayout["RootLayout\n(src/app/layout.tsx)"]
    ChatPage["Chat\n(src/app/page.tsx)"]
    ConversationDrawer["ConversationDrawer\n(left-side history panel)"]
    ConversationItem["ConversationItem\n(single history entry)"]
    IndexedDB["IndexedDB\n(Dexie — histories table)"]

    RootLayout --> ChatPage
    ChatPage --> ConversationDrawer
    ConversationDrawer --> ConversationItem
    ChatPage -- "reads/writes via useHistory" --> IndexedDB
```

### Pages

| Route | File               | Description                                                                                                     |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/`   | `src/app/page.tsx` | Chat interface — send messages, display streaming responses, persist and browse conversation history via drawer |

---

## BACKEND

```mermaid
graph TD
    Client["Client\n(ChatPage)"]
    ChatRoute["POST /api/chat\n(src/app/api/chat/route.ts)"]
    Validation["Zod validation\nMESSAGE schema"]
    Haiku["Anthropic API\nclaude-haiku-4-5-20251001\nPII Detection"]
    Redact["PII Redaction\nreplace PII with &lt;s&gt;*****&lt;/s&gt;\nin streamed chunks"]
    Sonnet["Anthropic API\nclaude-sonnet-4-5-20250929\nMain answer"]
    Stream["UI Message Stream\n(createUIMessageStreamResponse)"]

    Client -->|"{ id, date, message, type }"| ChatRoute
    ChatRoute --> Validation
    Validation -->|invalid| Error["400 Bad Request"]
    Validation -->|valid| Haiku
    Haiku -->|"pii: string[]"| Redact
    Haiku -->|"pii: string[]"| Stream
    Redact --> Stream
    Sonnet --> Redact
    Validation -->|valid| Sonnet
    Stream -->|"streaming response\n+ answer metadata\n(incl. pii[] in clear)"| Client
```

### Endpoints

| Method | Path        | Description                                                                                                                                                                              |
| ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/chat` | Validates body with Zod (`MESSAGE` schema), runs PII detection via Haiku, streams a redacted text response from Sonnet with answer metadata (including detected PII values in clear) |

### External Providers

| Provider  | SDK                 | Model                        | Role                                      |
| --------- | ------------------- | ---------------------------- | ----------------------------------------- |
| Anthropic | `@ai-sdk/anthropic` | `claude-haiku-4-5-20251001`  | PII detection (pre-processing, blocking)  |
| Anthropic | `@ai-sdk/anthropic` | `claude-sonnet-4-5-20250929` | Main answer (streamed, PII-redacted)      |
