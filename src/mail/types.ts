/** A normalized Gmail message. */
export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
  body: string;
  htmlBody: string;
  snippet: string;
  labels: string[];
  attachments: GmailAttachment[];
  isUnread: boolean;
};

/** An attachment on a Gmail message. */
export type GmailAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Base64-encoded data. Only populated for attachments under the size limit. */
  data?: string;
  /** Present when the attachment was skipped due to size. */
  skipped?: boolean;
  /** Human-readable reason the attachment was skipped. */
  skipReason?: string;
};

/** Persisted history-based sync state for a single Gmail account. */
export type GmailHistoryState = {
  historyId: string;
  email: string;
  lastSyncAt: string;
};

/** State for a Gmail Pub/Sub push watch subscription. */
export type GmailWatchState = {
  historyId: string;
  expiration: number;
  topicName: string;
};

/** Per-account OAuth and behavior configuration. */
export type GoogleMailAccountConfig = {
  accountId: string;
  enabled: boolean;
  name: string;

  // Auth -- user OAuth 2.0 (primary)
  credentials?: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    type?: string;
  };
  credentialsFile?: string;

  // Auth -- service account (fallback)
  serviceAccountFile?: string;
  serviceAccountCredentials?: Record<string, unknown>;

  // Behavior
  labelFilter: string[];
  processRead: boolean;
  markReadAfterProcessing: boolean;
  mediaMaxMb: number;
  pollIntervalMinutes: number;
  pubsubTopic?: string;
  webhookUrl?: string;
  signature?: string;

  // Enabled actions
  actions: GoogleMailActions;
};

/** Which outbound actions are enabled for an account. */
export type GoogleMailActions = {
  send: boolean;
  reply: boolean;
  draft: boolean;
  label: boolean;
  archive: boolean;
  markRead: boolean;
  search: boolean;
};

/** Parameters for composing and sending an email. */
export type SendEmailParams = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  replyToMessageId?: string;
  threadId?: string;
};

/** Raw Gmail API message resource shape. */
export type RawGmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: RawGmailMessagePart;
  sizeEstimate?: number;
  raw?: string;
};

/** A MIME message part from the Gmail API. */
export type RawGmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: RawGmailMessagePart[];
};

/** Gmail API messages.list response shape. */
export type GmailMessagesListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

/** Gmail API history.list response shape. */
export type GmailHistoryListResponse = {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
};

/** A single history record from the Gmail API. */
export type GmailHistoryRecord = {
  id: string;
  messages?: Array<{ id: string; threadId: string }>;
  messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
  messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
  labelsAdded?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
  labelsRemoved?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
};

/** Gmail API users.getProfile response shape. */
export type GmailProfileResponse = {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
};

/** Gmail API users.watch response shape. */
export type GmailWatchResponse = {
  historyId?: string;
  expiration?: string;
};

/** Gmail API labels.list response shape. */
export type GmailLabelsListResponse = {
  labels?: Array<{ id: string; name: string; type?: string }>;
};

/** Gmail API threads.get response shape. */
export type GmailThreadResponse = {
  id?: string;
  historyId?: string;
  messages?: RawGmailMessage[];
};

/** Gmail API attachments.get response shape. */
export type GmailAttachmentResponse = {
  attachmentId?: string;
  size?: number;
  data?: string;
};

/** Pub/Sub push notification data decoded from base64. */
export type GmailPubSubNotification = {
  emailAddress: string;
  historyId: number;
};
