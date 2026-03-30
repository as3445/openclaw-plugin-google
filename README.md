# openclaw-plugin-google

Google Calendar and Gmail plugin for OpenClaw.

## Install

```bash
npm install openclaw-plugin-google
```

## Calendar Features

- Bidirectional event sync with incremental sync tokens
- Push notifications via webhook (or polling fallback)
- Events CRUD: list, get, create, update, delete
- Automatic watch channel renewal

## Gmail Features

- Incremental history-based sync via Pub/Sub or polling
- Send, reply, draft, search, archive, label, mark-read
- Attachment download with size limits
- Multi-account support
- RFC 2822 message composition with multipart HTML

## Config

Both modules export Zod config schemas for validation:

```typescript
import { calendar, mail } from "openclaw-plugin-google";

const calConfig = calendar.GoogleCalendarConfigSchema.parse({ calendarId: "primary" });
const mailConfig = mail.GoogleMailConfigSchema.parse({ enabled: true });
```

## Setup

1. Create a Google Cloud project with Calendar and Gmail APIs enabled.
2. Create OAuth 2.0 credentials (or a service account).
3. Pass credentials via the account config objects.

## License

MIT
