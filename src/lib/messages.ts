import { randomUUID } from "crypto";
import { access, mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { isDeviceId } from "@/lib/access";

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_MESSAGES = 200;
export const MAX_DISPLAY_NAME = 40;
export const MAX_DEVICE_LABEL = 40;
export const MAX_MENTIONS = 8;
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export type MessageReaction = {
  emoji: string;
  deviceIds: string[];
};

export type StoredMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  displayName: string;
  deviceLabel: string;
  replyToId: string | null;
  mentions: string[];
  reactions: MessageReaction[];
  deliveredTo: string[];
  readBy: string[];
};

export type MessageView = {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  isMine: boolean;
  displayName: string;
  deviceLabel: string;
  replyToId: string | null;
  replyPreview: {
    id: string;
    text: string;
    displayName: string;
  } | null;
  mentions: string[];
  reactions: MessageReaction[];
  deliveredCount: number;
  readCount: number;
  tick: "sent" | "delivered" | "read";
};

type MessageStore = {
  messages: StoredMessage[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const MESSAGES_PATH = path.join(DATA_DIR, "messages.json");

function assertSafeId(id: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new Error("Invalid message id");
  }
  return id;
}

function cleanName(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, max);
  return trimmed || fallback;
}

function normalizeReaction(raw: unknown): MessageReaction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as MessageReaction;
  if (typeof r.emoji !== "string" || !r.emoji) return null;
  if (!Array.isArray(r.deviceIds)) return null;
  return {
    emoji: r.emoji.slice(0, 8),
    deviceIds: r.deviceIds.filter(isDeviceId),
  };
}

function normalizeMessage(message: StoredMessage): StoredMessage | null {
  if (!message || typeof message !== "object") return null;
  if (!isDeviceId(message.senderId)) return null;
  if (typeof message.text !== "string" || !message.text.trim()) return null;
  if (typeof message.createdAt !== "string") return null;
  try {
    assertSafeId(message.id);
  } catch {
    return null;
  }
  let replyToId: string | null = null;
  if (typeof message.replyToId === "string" && message.replyToId) {
    try {
      replyToId = assertSafeId(message.replyToId);
    } catch {
      replyToId = null;
    }
  }
  return {
    id: message.id,
    text: message.text.slice(0, MAX_MESSAGE_LENGTH),
    senderId: message.senderId,
    createdAt: message.createdAt,
    displayName: cleanName(message.displayName, MAX_DISPLAY_NAME, "Guest"),
    deviceLabel: cleanName(message.deviceLabel, MAX_DEVICE_LABEL, "Browser"),
    replyToId,
    mentions: Array.isArray(message.mentions)
      ? message.mentions
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim().slice(0, MAX_DISPLAY_NAME))
          .filter(Boolean)
          .slice(0, MAX_MENTIONS)
      : [],
    reactions: Array.isArray(message.reactions)
      ? message.reactions
          .map((r) => normalizeReaction(r))
          .filter((r): r is MessageReaction => r !== null)
      : [],
    deliveredTo: Array.isArray(message.deliveredTo)
      ? message.deliveredTo.filter(isDeviceId)
      : [],
    readBy: Array.isArray(message.readBy)
      ? message.readBy.filter(isDeviceId)
      : [],
  };
}

async function ensureStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(MESSAGES_PATH);
  } catch {
    await writeFile(
      MESSAGES_PATH,
      JSON.stringify({ messages: [] } satisfies MessageStore, null, 2),
      "utf8",
    );
  }
}

async function readStore(): Promise<MessageStore> {
  await ensureStore();
  const raw = await readFile(MESSAGES_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as MessageStore;
    if (!parsed || !Array.isArray(parsed.messages)) {
      return { messages: [] };
    }
    return {
      messages: parsed.messages
        .map((m) => normalizeMessage(m))
        .filter((m): m is StoredMessage => m !== null),
    };
  } catch {
    return { messages: [] };
  }
}

async function writeStore(store: MessageStore): Promise<void> {
  await ensureStore();
  const tmp = `${MESSAGES_PATH}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, MESSAGES_PATH);
}

function tickFor(message: StoredMessage, deviceId: string | null): MessageView["tick"] {
  const peersRead = message.readBy.filter((id) => id !== message.senderId);
  if (peersRead.length > 0) return "read";
  const peersDelivered = message.deliveredTo.filter((id) => id !== message.senderId);
  if (peersDelivered.length > 0) return "delivered";
  void deviceId;
  return "sent";
}

export function toMessageView(
  message: StoredMessage,
  deviceId: string | null,
  byId?: Map<string, StoredMessage>,
): MessageView {
  let replyPreview: MessageView["replyPreview"] = null;
  if (message.replyToId && byId) {
    const parent = byId.get(message.replyToId);
    if (parent) {
      replyPreview = {
        id: parent.id,
        text: parent.text.slice(0, 120),
        displayName: parent.displayName,
      };
    }
  }
  return {
    id: message.id,
    text: message.text,
    senderId: message.senderId,
    createdAt: message.createdAt,
    isMine: Boolean(deviceId && message.senderId === deviceId),
    displayName: message.displayName,
    deviceLabel: message.deviceLabel,
    replyToId: message.replyToId,
    replyPreview,
    mentions: message.mentions,
    reactions: message.reactions,
    deliveredCount: message.deliveredTo.filter((id) => id !== message.senderId)
      .length,
    readCount: message.readBy.filter((id) => id !== message.senderId).length,
    tick: tickFor(message, deviceId),
  };
}

export async function listMessages(
  deviceId: string | null,
): Promise<MessageView[]> {
  const store = await readStore();
  const byId = new Map(store.messages.map((m) => [m.id, m]));
  return store.messages.map((m) => toMessageView(m, deviceId, byId));
}

export type AddMessageInput = {
  text: string;
  senderId: string;
  displayName?: string;
  deviceLabel?: string;
  replyToId?: string | null;
  mentions?: string[];
};

export async function addMessage(input: AddMessageInput): Promise<MessageView> {
  const { senderId } = input;
  if (!isDeviceId(senderId)) {
    throw new Error("Device id required");
  }
  const trimmed = input.text.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  const store = await readStore();
  let replyToId: string | null = null;
  if (input.replyToId) {
    assertSafeId(input.replyToId);
    if (!store.messages.some((m) => m.id === input.replyToId)) {
      throw new Error("Reply target not found");
    }
    replyToId = input.replyToId;
  }

  const message: StoredMessage = {
    id: randomUUID(),
    text: trimmed,
    senderId,
    createdAt: new Date().toISOString(),
    displayName: cleanName(input.displayName, MAX_DISPLAY_NAME, "Guest"),
    deviceLabel: cleanName(input.deviceLabel, MAX_DEVICE_LABEL, "Browser"),
    replyToId,
    mentions: Array.isArray(input.mentions)
      ? input.mentions
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim().slice(0, MAX_DISPLAY_NAME))
          .filter(Boolean)
          .slice(0, MAX_MENTIONS)
      : [],
    reactions: [],
    deliveredTo: [],
    readBy: [],
  };
  store.messages.push(message);
  if (store.messages.length > MAX_MESSAGES) {
    store.messages = store.messages.slice(-MAX_MESSAGES);
  }
  await writeStore(store);
  const byId = new Map(store.messages.map((m) => [m.id, m]));
  return toMessageView(message, senderId, byId);
}

export async function ackMessages(
  deviceId: string,
  ids: string[],
  action: "delivered" | "read",
): Promise<MessageView[]> {
  if (!isDeviceId(deviceId)) throw new Error("Device id required");
  const store = await readStore();
  const idSet = new Set(
    ids
      .filter((id) => typeof id === "string")
      .map((id) => {
        try {
          return assertSafeId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is string => Boolean(id)),
  );
  let changed = false;
  for (const message of store.messages) {
    if (!idSet.has(message.id)) continue;
    if (message.senderId === deviceId) continue;
    if (action === "delivered") {
      if (!message.deliveredTo.includes(deviceId)) {
        message.deliveredTo.push(deviceId);
        changed = true;
      }
    } else if (!message.readBy.includes(deviceId)) {
      message.readBy.push(deviceId);
      if (!message.deliveredTo.includes(deviceId)) {
        message.deliveredTo.push(deviceId);
      }
      changed = true;
    }
  }
  if (changed) await writeStore(store);
  const byId = new Map(store.messages.map((m) => [m.id, m]));
  return store.messages.map((m) => toMessageView(m, deviceId, byId));
}

export async function reactToMessage(
  deviceId: string,
  messageId: string,
  emoji: string,
): Promise<MessageView> {
  if (!isDeviceId(deviceId)) throw new Error("Device id required");
  assertSafeId(messageId);
  const cleanEmoji = emoji.trim().slice(0, 8);
  if (!cleanEmoji) throw new Error("Emoji required");

  const store = await readStore();
  const message = store.messages.find((m) => m.id === messageId);
  if (!message) throw new Error("Message not found");

  const existing = message.reactions.find((r) => r.emoji === cleanEmoji);
  if (existing) {
    if (existing.deviceIds.includes(deviceId)) {
      existing.deviceIds = existing.deviceIds.filter((id) => id !== deviceId);
      if (existing.deviceIds.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== cleanEmoji);
      }
    } else {
      existing.deviceIds.push(deviceId);
    }
  } else {
    message.reactions.push({ emoji: cleanEmoji, deviceIds: [deviceId] });
  }

  await writeStore(store);
  const byId = new Map(store.messages.map((m) => [m.id, m]));
  return toMessageView(message, deviceId, byId);
}
