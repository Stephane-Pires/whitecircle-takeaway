# Architecture

## FRONTEND

```mermaid
graph TD
    RootLayout["RootLayout\n(src/app/layout.tsx)"]
    ChatPage["Chat\n(src/app/page.tsx)"]

    RootLayout --> ChatPage
```

### Pages

| Route | File               | Description                                                                       |
| ----- | ------------------ | --------------------------------------------------------------------------------- |
| `/`   | `src/app/page.tsx` | Chat interface — send messages, display conversation history, streaming responses |

---

## BACKEND

```mermaid
graph TD
    Client["Client\n(ChatPage)"]
    ChatRoute["POST /api/chat\n(src/app/api/chat/route.ts)"]
    Validation["Zod validation\nPROMPT_MESSAGE"]
    Anthropic["Anthropic API\nclaude-sonnet-4-5-20250929\n(@ai-sdk/anthropic)"]
    Stream["UI Message Stream\n(createUIMessageStreamResponse)"]

    Client -->|"{ message, created_date }"| ChatRoute
    ChatRoute --> Validation
    Validation -->|valid| Anthropic
    Validation -->|invalid| Error["400 Bad Request"]
    Anthropic --> Stream
    Stream -->|streaming response| Client
```

### Endpoints

| Method | Path        | Description                                                     |
| ------ | ----------- | --------------------------------------------------------------- |
| `POST` | `/api/chat` | Validates body with Zod, streams a text response from Anthropic |

### External Providers

| Provider  | SDK                 | Model                        |
| --------- | ------------------- | ---------------------------- |
| Anthropic | `@ai-sdk/anthropic` | `claude-sonnet-4-5-20250929` |
