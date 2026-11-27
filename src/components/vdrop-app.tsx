"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Check,
  CheckCheck,
  CheckSquare,
  Copy,
  CornerDownRight,
  Download,
  FileIcon,
  Home,
  Loader2,
  Lock,
  MessageCircle,
  Moon,
  Power,
  Recycle,
  RefreshCw,
  RotateCcw,
  Send,
  Smile,
  Square,
  Sun,
  Trash2,
  Unlock,
  Wifi,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn, formatBytes, formatUploadedAt, shortHash } from "@/lib/utils";

const DOWNLOADED_STORAGE_KEY = "vdrop-downloaded-ids-v1";
const LEGACY_DOWNLOADED_KEY = "ydroply-downloaded-ids-v1";
const LEGACY_DOWNLOADED_KEY_2 = "landrop-downloaded-ids-v1";
const UPLOADED_STORAGE_KEY = "vdrop-uploaded-ids-v1";
const LEGACY_UPLOADED_KEY = "ydroply-uploaded-ids-v1";
const LEGACY_UPLOADED_KEY_2 = "landrop-uploaded-ids-v1";
const DEVICE_STORAGE_KEY = "vdrop-device-id-v1";
const LEGACY_DEVICE_KEY = "ydroply-device-id-v1";
const LEGACY_DEVICE_KEY_2 = "landrop-device-id-v1";
const THEME_STORAGE_KEY = "vdrop-theme";
const LEGACY_THEME_KEY = "ydroply-theme";
const LEGACY_THEME_KEY_2 = "landrop-theme";
const DISPLAY_NAME_KEY = "vdrop-display-name";
const LEGACY_DISPLAY_NAME_KEY = "ydroply-display-name";
const AUTO_REFRESH_MS = 3000;
const OS_NOTIFY_ASKED_KEY = "vdrop-os-notify-asked-v1";
const OS_NOTIFY_DISMISS_KEY = "vdrop-os-notify-dismiss-v1";

function supportsOsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}
const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/gi;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
const IMAGE_CLIPBOARD_ERR = "IMAGE_CLIPBOARD_INSECURE";
type ThemeMode = "light" | "dark";

type MessageReplyPreview = {
  id: string;
  text: string;
  displayName: string;
} | null;

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  isMine: boolean;
  displayName: string;
  deviceLabel: string;
  replyToId: string | null;
  replyPreview: MessageReplyPreview;
  mentions: string[];
  reactions: { emoji: string; deviceIds: string[] }[];
  tick: "sent" | "delivered" | "read";
  deliveredCount: number;
  readCount: number;
};

function guestLabel(senderId: string): string {
  return `Guest-${senderId.slice(0, 4)}`;
}

function readStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
    if (legacyKey) return window.localStorage.getItem(legacyKey);
    return null;
  } catch {
    return null;
  }
}

function deriveDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  let os = "Device";
  if (/iPhone|iPad|iPod/i.test(ua)) os = /iPad/i.test(ua) ? "iPad" : "iPhone";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
}

function extractMentions(text: string): string[] {
  const names = new Set<string>();
  const re = /@([^\s@][^\s@]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return [...names].slice(0, 8);
}

function setDeviceHeaders(headers: Headers, deviceId: string) {
  headers.set("X-VDrop-Device", deviceId);
  headers.set("X-YDroply-Device", deviceId);
  headers.set("X-LanDrop-Device", deviceId);
}

type MessageBodyHandlers = {
  displayName: string;
  onMentionClick?: (name: string) => void;
};

function formatMessageBody(text: string, handlers: MessageBodyHandlers): ReactNode[] {
  const combined = new RegExp(
    `(${MESSAGE_URL_RE.source})|@([^\\s@][^\\s@]*)`,
    "gi",
  );
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const myName = handlers.displayName.trim().toLowerCase();
  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const url = match[1];
    const mentionName = match[2];
    if (url) {
      nodes.push(
        <a
          key={`u-${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline underline-offset-2"
        >
          {url}
        </a>,
      );
    } else if (mentionName) {
      const taggedYou = Boolean(myName && mentionName.toLowerCase() === myName);
      nodes.push(
        <button
          key={`m-${key++}`}
          type="button"
          className={cn(
            "inline rounded px-0.5 align-baseline font-semibold",
            taggedYou
              ? "bg-[rgba(159,232,112,0.55)] text-[var(--ink)]"
              : "text-[var(--accent-signal)] hover:underline",
          )}
          onClick={() => handlers.onMentionClick?.(mentionName)}
        >
          @{mentionName}
        </button>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [text];
}

function messageDisplayName(
  msg: Pick<ChatMessage, "isMine" | "displayName" | "senderId">,
  myName: string,
): string {
  return msg.isMine ? myName || "You" : msg.displayName || guestLabel(msg.senderId);
}

function messageMentionsViewer(
  msg: Pick<ChatMessage, "mentions">,
  viewerName: string,
): boolean {
  const me = viewerName.trim().toLowerCase();
  if (!me) return false;
  return msg.mentions.some((name) => name.toLowerCase() === me);
}

type AccessRequest = {
  deviceId: string;
  requestedAt: string;
};

// http://192.168.x.x and http://2.2.2.2 are not secure contexts.
// crypto.randomUUID() is missing there and was crashing the page after first paint.
function createDeviceId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing =
      readStorageItem(DEVICE_STORAGE_KEY, LEGACY_DEVICE_KEY) ??
      window.localStorage.getItem(LEGACY_DEVICE_KEY_2);
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        existing,
      )
    ) {
      if (!window.localStorage.getItem(DEVICE_STORAGE_KEY)) {
        window.localStorage.setItem(DEVICE_STORAGE_KEY, existing);
      }
      return existing;
    }
    const id = createDeviceId();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return createDeviceId();
  }
}

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const saved =
      readStorageItem(THEME_STORAGE_KEY, LEGACY_THEME_KEY) ??
      window.localStorage.getItem(LEGACY_THEME_KEY_2);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  const meta = document.querySelector(
    'meta[name="theme-color"]',
  ) as HTMLMetaElement | null;
  if (meta) {
    meta.content = theme === "dark" ? "#0a1411" : "#f3f8f4";
  }
}

function readIdSet(
  key: string,
  legacyKey?: string,
  legacyKey2?: string,
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw =
      readStorageItem(key, legacyKey) ??
      (legacyKey2 ? window.localStorage.getItem(legacyKey2) : null);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  window.localStorage.setItem(key, JSON.stringify([...ids]));
}

function pruneIdSet(prev: Set<string>, valid: Set<string>, key: string): Set<string> {
  const next = new Set<string>();
  for (const id of prev) {
    if (valid.has(id)) next.add(id);
  }
  if (next.size !== prev.size) writeIdSet(key, next);
  return next;
}

type StoredFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  downloadCount?: number;
  uploaderId?: string;
  locked?: boolean;
  canAccess?: boolean;
  isUploader?: boolean;
  canManage?: boolean;
  requestPending?: boolean;
  redacted?: boolean;
  pendingRequests?: AccessRequest[];
};

function isImageFile(file: Pick<StoredFile, "mimeType" | "originalName">): boolean {
  if (file.mimeType.toLowerCase().startsWith("image/")) return true;
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.originalName);
}

async function blobToPngClipboard(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error("PNG encode failed"))),
        "image/png",
      );
    });
    return png;
  } finally {
    bitmap.close();
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    if (typeof document === "undefined") throw new Error("Clipboard unavailable");
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Clipboard copy failed");
  }
}

async function copyFileToClipboard(
  file: Pick<StoredFile, "id" | "mimeType" | "originalName">,
  deviceId: string,
): Promise<"image" | "file" | "link"> {
  const res = await fetch(fileUrl(file.id, deviceId), { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load file for copy.");
  const blob = await res.blob();
  const looksImage =
    isImageFile(file) || blob.type.toLowerCase().startsWith("image/");

  if (looksImage) {
    try {
      const png = await blobToPngClipboard(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return "image";
    } catch {
      throw new Error(IMAGE_CLIPBOARD_ERR);
    }
  }

  const mime = blob.type || "application/octet-stream";
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    return "file";
  } catch {
    const absolute = new URL(fileUrl(file.id, deviceId), window.location.origin)
      .href;
    await navigator.clipboard.writeText(absolute);
    return "link";
  }
}

function fileUrl(id: string, deviceId: string, inline = false): string {
  const params = new URLSearchParams();
  if (deviceId) params.set("device", deviceId);
  if (inline) params.set("inline", "1");
  const q = params.toString();
  return `/api/files/${id}${q ? `?${q}` : ""}`;
}

function FileThumb({
  file,
  deviceId,
}: {
  file: StoredFile;
  deviceId: string;
}) {
  const [failed, setFailed] = useState(false);
  const lockedAway = file.locked && file.canAccess === false;
  // Skip huge previews — loading every full image at once can crash the tab
  const smallEnough = file.size > 0 && file.size <= 400_000;
  const showPreview =
    !lockedAway && isImageFile(file) && !failed && smallEnough;

  if (lockedAway) {
    return (
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sky-wash)] text-[var(--ink-soft)]">
        <Lock className="size-3.5 opacity-70" />
      </span>
    );
  }

  if (showPreview) {
    return (
      <span className="mt-0.5 inline-flex size-9 shrink-0 overflow-hidden rounded-xl bg-[var(--sky-wash)] ring-1 ring-[var(--line)]">
        <img
          src={fileUrl(file.id, deviceId, true)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sky-wash)] text-[var(--ink-soft)]">
      <FileIcon className="size-4" />
    </span>
  );
}

type LanAddress = {
  interface: string;
  address: string;
  url: string;
};

type TrashItem = {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  deletedAt: string;
  daysUntilPurge: number;
  isUploader: boolean;
  canManage?: boolean;
};

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  initialFiles: StoredFile[];
  initialAddresses: LanAddress[];
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 8000,
  deviceId?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init?.headers);
    if (deviceId) setDeviceHeaders(headers, deviceId);
    const res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // keep default
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Check Wi‑Fi and that vDrop is still running.");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function VDropApp({ initialFiles, initialAddresses }: Props) {
  const [files, setFiles] = useState<StoredFile[]>(initialFiles);
  const [addresses, setAddresses] = useState<LanAddress[]>(initialAddresses);
  const [pageOrigin, setPageOrigin] = useState<string | null>(null);
  const [hostManage, setHostManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);
  const copiedItemTimerRef = useRef<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashDeletingId, setTrashDeletingId] = useState<string | null>(null);
  const [trashRestoringId, setTrashRestoringId] = useState<string | null>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const trashPanelRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  const [deviceId, setDeviceId] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinFileId, setPinFileId] = useState<string | null>(null);
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [deviceLabel] = useState(() =>
    typeof window !== "undefined" ? deriveDeviceLabel() : "Browser",
  );
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    text: string;
    displayName: string;
  } | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [poweredOff, setPoweredOff] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const [secretPanel, setSecretPanel] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropSectionRef = useRef<HTMLElement>(null);
  const [mobileLayout, setMobileLayout] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const secretRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const pendingScrollMessageIdRef = useRef<string | null>(null);
  const [messageFocus, setMessageFocus] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const lastScrolledMsgIdRef = useRef<string | null>(null);
  const noteCountRef = useRef(0);
  const noteSoundReady = useRef(false);
  const seenInboundMsgIdsRef = useRef<Set<string>>(new Set());
  const msgNotifyReady = useRef(false);
  const messagesOpenRef = useRef(false);
  const [messageNotices, setMessageNotices] = useState<ChatMessage[]>([]);
  const [notesMenuPos, setNotesMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const brandTapRef = useRef<{ count: number; timer: number | null }>({
    count: 0,
    timer: null,
  });
  const nameClickRef = useRef<{ id: string; count: number; timer: number | null }>({
    id: "",
    count: 0,
    timer: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [osNotifyPermission, setOsNotifyPermission] =
    useState<NotificationPermission>("default");
  const [osNotifyBanner, setOsNotifyBanner] = useState(false);
  const openChatFromOsNotifyRef = useRef<(messageId?: string) => void>(() => {});

  const playNotifySound = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const beep = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      beep(880, 0, 0.12);
      beep(1174, 0.14, 0.16);
      window.setTimeout(() => void ctx.close(), 500);
    } catch {
      // Ignore audio failures (autoplay policy, missing API).
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const update = () => setMobileLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showDesktopMessageNotifications = useCallback((batch: ChatMessage[]) => {
    if (!supportsOsNotifications() || Notification.permission !== "granted") {
      return;
    }
    if (batch.length === 0) return;
    const icon = "/favicon-32.png";
    const wire = (n: Notification, messageId?: string) => {
      n.onclick = (event) => {
        event.preventDefault();
        n.close();
        window.focus();
        openChatFromOsNotifyRef.current(messageId);
      };
    };
    if (batch.length === 1) {
      const m = batch[0]!;
      const from = m.displayName || guestLabel(m.senderId);
      const body =
        m.text.length > 160 ? `${m.text.slice(0, 157)}…` : m.text;
      const n = new Notification("vDrop · New message", {
        body: `${from}: ${body}`,
        icon,
        tag: `vdrop-msg-${m.id}`,
      });
      wire(n, m.id);
      return;
    }
    const n = new Notification("vDrop · Group chat", {
      body: `${batch.length} new messages on this Wi‑Fi`,
      icon,
      tag: "vdrop-msg-batch",
    });
    wire(n, batch[batch.length - 1]?.id);
  }, []);

  const requestOsNotifications = useCallback(async () => {
    if (!supportsOsNotifications()) return;
    try {
      const next = await Notification.requestPermission();
      setOsNotifyPermission(next);
      try {
        window.localStorage.setItem(OS_NOTIFY_ASKED_KEY, "1");
      } catch {
        // ignore
      }
      if (next === "granted") setOsNotifyBanner(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    openChatFromOsNotifyRef.current = (messageId?: string) => {
      setMessagesOpen(true);
      setNotesOpen(false);
      setMessageNotices([]);
      setUnreadMessages(0);
      if (messageId) {
        pendingScrollMessageIdRef.current = messageId;
        setMessageFocus({ id: messageId, label: "Notification" });
      }
    };
  }, []);

  useEffect(() => {
    setPageOrigin(window.location.origin);
    if (supportsOsNotifications()) {
      setOsNotifyPermission(Notification.permission);
    }
    setDeviceId(getOrCreateDeviceId());
    setDownloadedIds(
      readIdSet(
        DOWNLOADED_STORAGE_KEY,
        LEGACY_DOWNLOADED_KEY,
        LEGACY_DOWNLOADED_KEY_2,
      ),
    );
    setUploadedIds(
      readIdSet(
        UPLOADED_STORAGE_KEY,
        LEGACY_UPLOADED_KEY,
        LEGACY_UPLOADED_KEY_2,
      ),
    );
    try {
      const savedName = readStorageItem(DISPLAY_NAME_KEY, LEGACY_DISPLAY_NAME_KEY);
      if (savedName) setDisplayName(savedName.trim());
    } catch {
      // ignore
    }
    const initialTheme = readTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (!pageOrigin || !isLoopbackOrigin(pageOrigin)) return;
    if (!supportsOsNotifications()) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(OS_NOTIFY_DISMISS_KEY) === "1";
    } catch {
      // ignore
    }
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    if (dismissed) {
      setOsNotifyBanner(true);
      return;
    }
    let asked = false;
    try {
      asked = window.localStorage.getItem(OS_NOTIFY_ASKED_KEY) === "1";
    } catch {
      // ignore
    }
    if (!asked) {
      const timer = window.setTimeout(() => {
        void requestOsNotifications();
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    setOsNotifyBanner(true);
  }, [pageOrigin, requestOsNotifications]);

  useEffect(() => {
    if (!notesOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (bellButtonRef.current?.contains(target)) return;
      if (notificationPanelRef.current?.contains(target)) return;
      setNotesOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [notesOpen]);

  useEffect(() => {
    if (!secretPanel) return;
    const onPointer = (event: PointerEvent) => {
      if (!secretRef.current?.contains(event.target as Node)) {
        setSecretPanel(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [secretPanel]);

  useEffect(() => {
    messagesOpenRef.current = messagesOpen;
    if (messagesOpen) {
      setUnreadMessages(0);
      setMessageNotices([]);
      try {
        const savedName = readStorageItem(DISPLAY_NAME_KEY, LEGACY_DISPLAY_NAME_KEY);
        if (savedName?.trim()) {
          setDisplayName(savedName.trim());
        } else {
          setNicknameDraft("");
          setNicknameModalOpen(true);
        }
      } catch {
        setNicknameModalOpen(true);
      }
    }
  }, [messagesOpen]);

  // Scroll only the chat list — never the page (scrollIntoView was fighting the user).
  useEffect(() => {
    if (!messagesOpen) return;
    const list = messagesListRef.current;
    if (!list) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const justOpened = lastScrolledMsgIdRef.current === null && lastId !== null;
    const newMessage =
      lastId !== null && lastId !== lastScrolledMsgIdRef.current;
    if (!justOpened && !newMessage && lastScrolledMsgIdRef.current !== null) {
      return;
    }
    lastScrolledMsgIdRef.current = lastId;
    list.scrollTop = list.scrollHeight;
  }, [messages, messagesOpen]);

  useEffect(() => {
    if (!messagesOpen) {
      lastScrolledMsgIdRef.current = null;
    }
  }, [messagesOpen]);

  useEffect(() => {
    if (!notesOpen) {
      setNotesMenuPos(null);
      return;
    }
    const place = () => {
      const anchor = bellButtonRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 288;
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      setNotesMenuPos({ top: rect.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [notesOpen]);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const primaryUrl = useMemo(() => {
    // Prefer the URL the browser is already using when it is a LAN address.
    if (pageOrigin && !isLoopbackOrigin(pageOrigin)) return pageOrigin;
    if (addresses[0]?.url) return addresses[0].url;
    if (pageOrigin) return pageOrigin;
    return null;
  }, [pageOrigin, addresses]);

  const refreshFiles = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        const data = await fetchJson<{ files: StoredFile[] }>(
          "/api/files",
          undefined,
          8000,
          deviceId || undefined,
        );
        setFiles(data.files);
        const valid = new Set(data.files.map((f) => f.id));
        setSelectedIds((prev) => {
          const next = new Set<string>();
          for (const id of prev) {
            if (valid.has(id)) next.add(id);
          }
          return next;
        });
        setDownloadedIds((prev) => pruneIdSet(prev, valid, DOWNLOADED_STORAGE_KEY));
        setUploadedIds((prev) => {
          const next = pruneIdSet(prev, valid, UPLOADED_STORAGE_KEY);
          let changed = false;
          for (const f of data.files) {
            if (f.isUploader && !next.has(f.id)) {
              next.add(f.id);
              changed = true;
            }
          }
          if (changed) writeIdSet(UPLOADED_STORAGE_KEY, next);
          return next;
        });
        setListError(null);
      } catch (err) {
        if (!opts?.silent) {
          setListError(err instanceof Error ? err.message : "Could not load files.");
        }
      }
    },
    [deviceId],
  );

  const refreshTrash = useCallback(async () => {
    try {
      const data = await fetchJson<{
        items: TrashItem[];
        retentionDays: number;
      }>("/api/trash", undefined, 8000, deviceId || undefined);
      setTrashItems(data.items);
      setTrashError(null);
    } catch (err) {
      setTrashError(
        err instanceof Error ? err.message : "Could not load recycle bin.",
      );
    }
  }, [deviceId]);

  const trashMineCount = useMemo(
    () => trashItems.filter((t) => t.canManage ?? t.isUploader).length,
    [trashItems],
  );

  useEffect(() => {
    if (!trashOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trashRef.current?.contains(target)) return;
      if (trashPanelRef.current?.contains(target)) return;
      setTrashOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [trashOpen]);

  useEffect(() => {
    if (!trashOpen) return;
    setTrashLoading(true);
    void refreshTrash().finally(() => setTrashLoading(false));
  }, [trashOpen, refreshTrash]);

  const refreshMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!deviceId) return;
      try {
        const data = await fetchJson<{ messages: ChatMessage[] }>(
          "/api/messages",
          undefined,
          8000,
          deviceId,
        );
        const next = data.messages;
        const inbound = next.filter((m) => !m.isMine);
        const fresh = inbound.filter(
          (m) => !seenInboundMsgIdsRef.current.has(m.id),
        );
        if (!msgNotifyReady.current) {
          for (const m of inbound) seenInboundMsgIdsRef.current.add(m.id);
          msgNotifyReady.current = true;
        } else if (fresh.length > 0) {
          for (const m of fresh) seenInboundMsgIdsRef.current.add(m.id);
          const tabHidden = document.visibilityState === "hidden";
          const useOs =
            tabHidden &&
            supportsOsNotifications() &&
            Notification.permission === "granted";
          if (!messagesOpenRef.current) {
            setMessageNotices((prev) => [...fresh, ...prev].slice(0, 20));
            setUnreadMessages((prev) => prev + fresh.length);
            if (!tabHidden) {
              playNotifySound();
              setNotesOpen(true);
            }
          } else if (tabHidden) {
            playNotifySound();
          }
          if (useOs) {
            showDesktopMessageNotifications(fresh);
            playNotifySound();
          }
        }
        setMessages(next);
        const inboundIds = next.filter((m) => !m.isMine).map((m) => m.id);
        if (inboundIds.length > 0) {
          void fetchJson(
            "/api/messages/ack",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: inboundIds, action: "delivered" }),
            },
            8000,
            deviceId,
          ).catch(() => undefined);
          if (messagesOpenRef.current) {
            void fetchJson(
              "/api/messages/ack",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: inboundIds, action: "read" }),
              },
              8000,
              deviceId,
            ).catch(() => undefined);
          }
        }
        if (!opts?.silent) setMessageError(null);
      } catch (err) {
        if (!opts?.silent) {
          setMessageError(
            err instanceof Error ? err.message : "Could not load messages.",
          );
        }
      }
    },
    [deviceId, playNotifySound, showDesktopMessageNotifications],
  );

  const insertMention = useCallback((name: string) => {
    const token = `@${name} `;
    setMessageDraft((prev) => {
      if (!prev) return token;
      if (prev.endsWith(" ") || prev.endsWith("\n")) return `${prev}${token}`;
      return `${prev} ${token}`;
    });
  }, []);

  const scrollToMessage = useCallback((messageId: string, label = "Referenced message") => {
    setMessageFocus({ id: messageId, label });
    const run = () => {
      const list = messagesListRef.current;
      const el = document.getElementById(`vdrop-msg-${messageId}`);
      if (!list || !el) {
        pendingScrollMessageIdRef.current = messageId;
        return;
      }
      pendingScrollMessageIdRef.current = null;
      const listRect = list.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetTop =
        elRect.top -
        listRect.top +
        list.scrollTop -
        list.clientHeight / 2 +
        elRect.height / 2;
      list.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }, []);

  const jumpToMentionAuthor = useCallback(
    (name: string) => {
      const needle = name.trim().toLowerCase();
      if (!needle) return;
      const myName = displayName.trim() || "You";
      const hit = [...messages]
        .reverse()
        .find(
          (m) =>
            messageDisplayName(m, myName).toLowerCase() === needle,
        );
      if (hit) {
        scrollToMessage(hit.id, `@${name}`);
        return;
      }
      insertMention(name);
    },
    [displayName, insertMention, messages, scrollToMessage],
  );

  useEffect(() => {
    if (!messageFocus?.id) return;
    const timer = window.setTimeout(() => setMessageFocus(null), 2600);
    return () => window.clearTimeout(timer);
  }, [messageFocus]);

  useEffect(() => {
    if (!messagesOpen) return;
    const id = pendingScrollMessageIdRef.current;
    if (!id) return;
    if (!messages.some((m) => m.id === id)) return;
    pendingScrollMessageIdRef.current = null;
    scrollToMessage(id, messageFocus?.label ?? "Message");
  }, [messageFocus?.label, messages, messagesOpen, scrollToMessage]);

  const saveNickname = () => {
    const trimmed = nicknameDraft.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!trimmed) return;
    setDisplayName(trimmed);
    try {
      window.localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
    } catch {
      // ignore
    }
    setNicknameModalOpen(false);
  };

  const sendMessage = async () => {
    const text = messageDraft.trim();
    if (!text || !deviceId || sendingMessage || !displayName.trim()) return;
    setSendingMessage(true);
    setMessageError(null);
    try {
      const data = await fetchJson<{ message: ChatMessage }>(
        "/api/messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            displayName: displayName.trim(),
            deviceLabel,
            replyToId: replyTo?.id ?? undefined,
            mentions: extractMentions(text),
          }),
        },
        8000,
        deviceId,
      );
      setMessageDraft("");
      setReplyTo(null);
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSendingMessage(false);
    }
  };

  const reactToMessage = async (msgId: string, emoji: string) => {
    if (!deviceId) return;
    try {
      const data = await fetchJson<{ message: ChatMessage }>(
        "/api/messages/react",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: msgId, emoji }),
        },
        8000,
        deviceId,
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === data.message.id ? data.message : m)),
      );
      setReactionPickerId(null);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Could not react.");
    }
  };

  const accessNotifications = useMemo(() => {
    const items: { fileId: string; fileName: string; requesterId: string }[] = [];
    for (const file of files) {
      if (!file.isUploader || !file.pendingRequests?.length) continue;
      for (const req of file.pendingRequests) {
        items.push({
          fileId: file.id,
          fileName: file.originalName,
          requesterId: req.deviceId,
        });
      }
    }
    return items;
  }, [files]);

  useEffect(() => {
    const count = accessNotifications.length;
    if (noteSoundReady.current && count > noteCountRef.current) {
      const tabHidden = document.visibilityState === "hidden";
      const newest = accessNotifications[0];
      if (
        tabHidden &&
        newest &&
        supportsOsNotifications() &&
        Notification.permission === "granted"
      ) {
        const n = new Notification("vDrop · Access request", {
          body: `Someone asked to download ${newest.fileName}`,
          icon: "/favicon-32.png",
          tag: `vdrop-access-${newest.fileId}`,
        });
        n.onclick = (event) => {
          event.preventDefault();
          n.close();
          window.focus();
          setNotesOpen(true);
        };
      }
      playNotifySound();
      if (!tabHidden) setNotesOpen(true);
    }
    noteCountRef.current = count;
    noteSoundReady.current = true;
  }, [accessNotifications, playNotifySound]);

  // Keep every open LanDrop tab in sync when someone uploads elsewhere
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (poweredOff) return;
      void refreshMessages({ silent: true });
      if (document.visibilityState !== "hidden") {
        void refreshFiles({ silent: true });
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshFiles, refreshMessages, poweredOff]);

  const onBrandTap = () => {
    const stamp = brandTapRef.current;
    if (stamp.timer) window.clearTimeout(stamp.timer);
    stamp.count += 1;
    // Private: seven quick taps on the title reveal power controls.
    if (stamp.count >= 7) {
      stamp.count = 0;
      setSecretPanel(true);
      setNotesOpen(false);
      return;
    }
    stamp.timer = window.setTimeout(() => {
      stamp.count = 0;
    }, 700);
  };

  const powerOff = async () => {
    if (powerBusy) return;
    setPowerBusy(true);
    setSecretPanel(false);
    setNotesOpen(false);
    try {
      await fetchJson("/api/shutdown", { method: "POST" }, 4000, deviceId || undefined);
    } catch {
      // Server may close the socket before the response lands.
    }
    setPoweredOff(true);
    setPowerBusy(false);
  };

  const restartVDrop = async () => {
    if (powerBusy) return;
    setPowerBusy(true);
    setSecretPanel(false);
    setNotesOpen(false);
    try {
      await fetchJson("/api/restart", { method: "POST" }, 4000, deviceId || undefined);
    } catch {
      // Process exits while restarting; ignore failed fetch.
    }
    // Wait for the new process, then reload this tab.
    window.setTimeout(() => {
      window.location.reload();
    }, 1600);
  };

  const refreshNetwork = useCallback(async () => {
    try {
      const data = await fetchJson<{
        addresses: LanAddress[];
        isHost?: boolean;
      }>("/api/network", undefined, 8000, deviceId || undefined);
      setAddresses(data.addresses);
      setHostManage(Boolean(data.isHost));
      setNetworkError(null);
    } catch (err) {
      // Page origin fallback still lets remote devices use the app.
      if (!pageOrigin || isLoopbackOrigin(pageOrigin)) {
        setNetworkError(
          err instanceof Error ? err.message : "Could not detect LAN address.",
        );
      }
    }
  }, [deviceId, pageOrigin]);

  useEffect(() => {
    if (!deviceId) return;
    // Soft refresh after hydration; initial HTML already has server data.
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([
        refreshFiles(),
        refreshNetwork(),
        refreshMessages(),
        refreshTrash(),
      ]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, refreshFiles, refreshNetwork, refreshMessages, refreshTrash]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshFiles(),
      refreshNetwork(),
      refreshMessages(),
      refreshTrash(),
    ]);
    setRefreshing(false);
  };

  const flashCopied = (id: string) => {
    if (copiedItemTimerRef.current) {
      window.clearTimeout(copiedItemTimerRef.current);
    }
    setCopiedItemId(id);
    copiedItemTimerRef.current = window.setTimeout(() => {
      setCopiedItemId(null);
      copiedItemTimerRef.current = null;
    }, 1600);
  };

  const copyMessageText = async (msg: ChatMessage) => {
    try {
      await copyTextToClipboard(msg.text);
      flashCopied(`msg:${msg.id}`);
    } catch {
      setMessageError("Could not copy message.");
    }
  };

  const copySharedFile = async (file: StoredFile) => {
    if (!deviceId || copyBusyId) return;
    setCopyBusyId(file.id);
    try {
      await copyFileToClipboard(file, deviceId);
      flashCopied(`file:${file.id}`);
    } catch (err) {
      if (err instanceof Error && err.message === IMAGE_CLIPBOARD_ERR) {
        setListError(
          "Could not copy image to the clipboard on this link. Use Download instead.",
        );
      } else {
        setListError(
          err instanceof Error ? err.message : "Could not copy file to clipboard.",
        );
      }
    } finally {
      setCopyBusyId(null);
    }
  };

  const copyUrl = async () => {
    if (!primaryUrl) return;
    try {
      await copyTextToClipboard(primaryUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNetworkError("Clipboard permission denied. Copy the link manually.");
    }
  };

  const uploadOne = (file: File) =>
    new Promise<void>((resolve) => {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setUploads((prev) => [
        ...prev,
        { key, name: file.name, progress: 0, status: "uploading" },
      ]);

      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("file", file, file.name);
      if (deviceId) form.append("deviceId", deviceId);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.round((event.loaded / event.total) * 100);
        setUploads((prev) =>
          prev.map((u) => (u.key === key ? { ...u, progress } : u)),
        );
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploads((prev) =>
            prev.map((u) =>
              u.key === key ? { ...u, progress: 100, status: "done" } : u,
            ),
          );
          try {
            const parsed = JSON.parse(xhr.responseText) as {
              file?: { id?: string };
            };
            if (parsed.file?.id) {
              setUploadedIds((prev) => {
                const next = new Set(prev);
                next.add(parsed.file!.id!);
                writeIdSet(UPLOADED_STORAGE_KEY, next);
                return next;
              });
            }
          } catch {
            // ignore parse issues; list refresh still runs
          }
          await refreshFiles();
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((u) => u.key !== key));
          }, 1200);
          resolve();
          return;
        }

        let message = "Upload failed.";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // keep default
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.key === key ? { ...u, status: "error", error: message } : u,
          ),
        );
        resolve();
      };

      xhr.onerror = () => {
        setUploads((prev) =>
          prev.map((u) =>
            u.key === key
              ? { ...u, status: "error", error: "Network error during upload." }
              : u,
          ),
        );
        resolve();
      };

      xhr.open("POST", "/api/files");
      if (deviceId) {
        xhr.setRequestHeader("X-VDrop-Device", deviceId);
        xhr.setRequestHeader("X-YDroply-Device", deviceId);
        xhr.setRequestHeader("X-LanDrop-Device", deviceId);
      }
      xhr.send(form);
    });

  const handleFiles = async (list: FileList | File[]) => {
    const selected = Array.from(list);
    for (const file of selected) {
      await uploadOne(file);
    }
  };

  const canDeleteFile = (file: StoredFile) =>
    hostManage ||
    Boolean(file.canManage) ||
    Boolean(file.isUploader) ||
    Boolean(!file.uploaderId && deviceId) ||
    uploadedIds.has(file.id);

  const canManageTrashItem = (item: TrashItem) =>
    hostManage || Boolean(item.canManage ?? item.isUploader);

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetchJson<{ ok: boolean }>(
        `/api/files/${id}`,
        { method: "DELETE" },
        8000,
        deviceId,
      );
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await Promise.all([refreshFiles(), refreshTrash()]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const onDeleteMany = async (ids: string[]) => {
    const targets = ids.filter((id) => {
      const file = files.find((f) => f.id === id);
      return file ? canDeleteFile(file) : false;
    });
    if (targets.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    setListError(null);
    try {
      for (const id of targets) {
        await fetchJson<{ ok: boolean }>(
          `/api/files/${id}`,
          { method: "DELETE" },
          8000,
          deviceId,
        );
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of targets) next.delete(id);
        return next;
      });
      await Promise.all([refreshFiles(), refreshTrash()]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Delete failed.");
      await Promise.all([refreshFiles(), refreshTrash()]);
    } finally {
      setBulkDeleting(false);
    }
  };

  const onPermanentTrashDelete = async (id: string) => {
    setTrashDeletingId(id);
    setTrashError(null);
    try {
      await fetchJson<{ ok: boolean }>(
        `/api/trash/${id}`,
        { method: "DELETE" },
        8000,
        deviceId,
      );
      await refreshTrash();
    } catch (err) {
      setTrashError(
        err instanceof Error ? err.message : "Permanent delete failed.",
      );
    } finally {
      setTrashDeletingId(null);
    }
  };

  const onRestoreTrash = async (id: string) => {
    setTrashRestoringId(id);
    setTrashError(null);
    try {
      await fetchJson<{ ok: boolean }>(
        `/api/trash/${id}`,
        { method: "POST" },
        8000,
        deviceId,
      );
      await Promise.all([refreshTrash(), refreshFiles()]);
    } catch (err) {
      setTrashError(
        err instanceof Error ? err.message : "Restore failed.",
      );
    } finally {
      setTrashRestoringId(null);
    }
  };

  const toggleLock = async (file: StoredFile) => {
    if (!deviceId || !file.isUploader) return;
    setAccessBusyId(file.id);
    try {
      await fetchJson(
        `/api/files/${file.id}/lock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked: !file.locked }),
        },
        8000,
        deviceId,
      );
      await refreshFiles();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not update lock.");
    } finally {
      setAccessBusyId(null);
    }
  };

  const requestAccess = async (fileId: string) => {
    if (!deviceId) return;
    setAccessBusyId(fileId);
    try {
      await fetchJson(
        `/api/files/${fileId}/access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request" }),
        },
        8000,
        deviceId,
      );
      await refreshFiles();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setAccessBusyId(null);
    }
  };

  const respondAccess = async (
    fileId: string,
    requesterId: string,
    allow: boolean,
  ) => {
    if (!deviceId) return;
    setAccessBusyId(fileId);
    try {
      await fetchJson(
        `/api/files/${fileId}/access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: allow ? "allow" : "deny",
            requesterId,
          }),
        },
        8000,
        deviceId,
      );
      await refreshFiles();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not respond.");
    } finally {
      setAccessBusyId(null);
    }
  };

  const submitPin = async (fileId: string) => {
    if (!deviceId) return;
    setAccessBusyId(fileId);
    setPinError(null);
    try {
      await fetchJson(
        `/api/files/${fileId}/access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pin", pin: pinValue }),
        },
        8000,
        deviceId,
      );
      setPinFileId(null);
      setPinValue("");
      await refreshFiles();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Wrong code");
    } finally {
      setAccessBusyId(null);
    }
  };

  const onLockedNameClick = (fileId: string) => {
    const stamp = nameClickRef.current;
    if (stamp.timer) window.clearTimeout(stamp.timer);
    if (stamp.id !== fileId) {
      stamp.id = fileId;
      stamp.count = 0;
    }
    stamp.count += 1;
    if (stamp.count >= 5) {
      stamp.count = 0;
      setPinFileId(fileId);
      setPinValue("");
      setPinError(null);
      return;
    }
    stamp.timer = window.setTimeout(() => {
      stamp.count = 0;
    }, 900);
  };

  const selectableFiles = files.filter((f) => !f.locked || f.canAccess !== false);
  const deletableFiles = files.filter(canDeleteFile);
  const allSelected =
    selectableFiles.length > 0 &&
    selectableFiles.every((f) => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;
  const deletableSelectedIds = deletableFiles
    .filter((f) => selectedIds.has(f.id))
    .map((f) => f.id);
  const canBulkDelete = deletableSelectedIds.length > 0;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableFiles.map((f) => f.id)));
  };

  const markDownloaded = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setDownloadedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      writeIdSet(DOWNLOADED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Tell the server a peer downloaded — uploader's own downloads do not count. */
  const reportPeerDelivery = useCallback(
    (ids: string[]) => {
      const peerIds = ids.filter((id) => !uploadedIds.has(id));
      if (peerIds.length === 0) return;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (deviceId) {
        headers["X-VDrop-Device"] = deviceId;
        headers["X-YDroply-Device"] = deviceId;
        headers["X-LanDrop-Device"] = deviceId;
      }
      void fetch("/api/files/delivered", {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: peerIds }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => {
        // Tick sync is best-effort; list auto-refresh will catch up later
      });
    },
    [uploadedIds, deviceId],
  );

  const onDownload = useCallback(
    (ids: string[]) => {
      markDownloaded(ids);
      reportPeerDelivery(ids);
    },
    [markDownloaded, reportPeerDelivery],
  );

  const tickStateFor = (
    file: StoredFile,
  ): "downloaded" | "uploaded" | "none" => {
    // Blue: this device downloaded it
    if (downloadedIds.has(file.id)) return "downloaded";
    // Orange: this device uploaded it AND a peer has downloaded it
    if (
      (uploadedIds.has(file.id) || file.isUploader) &&
      (file.downloadCount ?? 0) > 0
    ) {
      return "uploaded";
    }
    // Blank right after upload (and for everyone else) until a peer downloads
    return "none";
  };

  const downloadBulk = (ids: string[]) => {
    const allowed = ids.filter((id) => {
      const f = files.find((x) => x.id === id);
      return f && f.canAccess !== false;
    });
    if (allowed.length === 0) return;
    if (allowed.length === 1) {
      const file = files.find((f) => f.id === allowed[0]);
      const a = document.createElement("a");
      a.href = fileUrl(allowed[0], deviceId);
      a.download = file?.originalName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      onDownload(allowed);
      return;
    }

    // Streamed ZIP via browser download manager (avoids buffering huge archives in JS)
    const params = new URLSearchParams();
    for (const id of allowed) params.append("id", id);
    if (deviceId) params.set("device", deviceId);
    const a = document.createElement("a");
    a.href = `/api/files/zip?${params.toString()}`;
    a.download = `vdrop-${allowed.length}-files.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    onDownload(allowed);
  };

  const showInitialLoading = loading && files.length === 0 && !listError;

  const secondaryAddresses = addresses.filter(
    (a) =>
      a.url !== primaryUrl &&
      !/vethernet|hyper-v|wsl|docker|virtual|bluetooth|local area connection\*/i.test(
        a.interface,
      ),
  );

  if (poweredOff) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--foam)] px-6 text-center">
        <Power className="mb-4 size-10 text-[var(--ink-muted)]" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          vDrop is off
        </h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--ink-muted)]">
          The server on this PC has stopped. Run{" "}
          <code className="font-mono text-[var(--ink)]">npm run vdrop</code> to turn it
          back on.
        </p>
      </div>
    );
  }

  return (
    <div className="vdrop-shell relative min-h-dvh overflow-x-hidden bg-[var(--foam)] min-[900px]:min-h-0">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,_var(--glow-green)_0%,_transparent_68%)] blur-2xl" />
        <div className="absolute -right-20 -top-16 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_var(--glow-blue)_0%,_transparent_70%)] blur-2xl" />
        <div className="absolute bottom-[-8rem] left-1/2 h-[24rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_var(--glow-lime)_0%,_transparent_72%)] blur-2xl" />
      </div>

      <main
        className={cn(
          "relative mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col gap-3 px-4 py-3 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:gap-4 sm:px-5 sm:py-4 min-[900px]:pb-4 lg:gap-4 lg:px-6 lg:py-4 min-[900px]:min-h-0",
          messagesOpen && !mobileLayout && "vdrop-main-with-phone",
        )}
      >
        {osNotifyBanner &&
          pageOrigin &&
          isLoopbackOrigin(pageOrigin) &&
          supportsOsNotifications() &&
          osNotifyPermission === "default" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm shadow-sm sm:px-4">
              <p className="text-[var(--ink)]">
                Allow notifications for{" "}
                <span className="font-medium">Windows alerts</span> when vDrop
                is in the background.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" size="sm" onClick={() => void requestOsNotifications()}>
                  Allow
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    try {
                      window.localStorage.setItem(OS_NOTIFY_DISMISS_KEY, "1");
                    } catch {
                      // ignore
                    }
                    setOsNotifyBanner(false);
                  }}
                >
                  Not now
                </Button>
              </div>
            </div>
          )}
        {/* Top band: brand + Wi‑Fi share strip */}
        <div className="animate-rise flex shrink-0 flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-6">
          <header className="min-w-0 min-[900px]:max-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <div className="relative min-w-0" ref={secretRef}>
                <button
                  type="button"
                  onClick={onBrandTap}
                  className="flex min-w-0 items-center border-0 bg-transparent p-0 text-left"
                  aria-label="vDrop"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-white p-1.5 shadow-[0_0_0_2px_rgba(159,232,112,0.22)] dark:bg-[#f8f8f8]">
                    <img
                      src="/vdrop-logo.png"
                      alt=""
                      width={48}
                      height={48}
                      className="h-full w-full object-contain"
                    />
                  </span>
                </button>
                {secretPanel && (
                  <div className="absolute left-0 top-full z-40 mt-2 flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-1.5 shadow-[0_18px_40px_-24px_rgba(12,48,42,0.45)]">
                    <button
                      type="button"
                      disabled={powerBusy}
                      onClick={() => void restartVDrop()}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--ink)] hover:bg-[var(--sky-wash)] disabled:opacity-50"
                      aria-label="Restart"
                      title="Restart"
                    >
                      {powerBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={powerBusy}
                      onClick={() => void powerOff()}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--ink)] hover:bg-[var(--sky-wash)] disabled:opacity-50"
                      aria-label="Power off"
                      title="Power off"
                    >
                      <Power className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
              <div className="relative" ref={trashRef}>
                <button
                  type="button"
                  aria-label="Recycle bin"
                  aria-expanded={trashOpen}
                  title="Recycle bin"
                  onClick={() => {
                    setTrashOpen((open) => !open);
                    setMessagesOpen(false);
                    setNotesOpen(false);
                  }}
                  className="vdrop-icon-btn relative inline-flex size-9 items-center justify-center rounded-full"
                >
                  <Recycle className="size-4 shrink-0" strokeWidth={2.25} />
                  {trashMineCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-signal)] px-1 text-[10px] font-semibold leading-4 text-[var(--on-accent)]">
                      {trashMineCount > 9 ? "9+" : trashMineCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="hidden items-center gap-2 min-[900px]:flex">
              <button
                type="button"
                aria-label="Messages"
                aria-expanded={messagesOpen}
                onClick={() => {
                  setMessagesOpen((open) => !open);
                  setNotesOpen(false);
                  setTrashOpen(false);
                }}
                className="vdrop-icon-btn relative inline-flex size-9 items-center justify-center rounded-full"
              >
                <MessageCircle className="size-4 shrink-0" strokeWidth={2.25} />
                {unreadMessages > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-signal)] px-1 text-[10px] font-semibold leading-4 text-[var(--on-accent)]">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </button>
              <div className="relative" ref={notesRef}>
                <button
                  ref={(el) => {
                    bellButtonRef.current = el;
                  }}
                  type="button"
                  aria-label="Notifications"
                  aria-expanded={notesOpen}
                  onClick={() => {
                    setNotesOpen((open) => !open);
                    setMessagesOpen(false);
                  }}
                  className="vdrop-icon-btn relative inline-flex size-9 items-center justify-center rounded-full"
                >
                  <Bell className="size-4 shrink-0" strokeWidth={2.25} />
                  {accessNotifications.length + messageNotices.length > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-signal)] px-1 text-[10px] font-semibold leading-4 text-[var(--on-accent)]">
                      {accessNotifications.length + messageNotices.length > 9
                        ? "9+"
                        : accessNotifications.length + messageNotices.length}
                    </span>
                  )}
                </button>
              </div>
              </div>
              {trashOpen &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={trashPanelRef}
                    className={cn(
                      "fixed z-[100] flex max-h-[min(52vh,440px)] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] shadow-[0_18px_40px_-24px_rgba(12,48,42,0.45)]",
                      mobileLayout
                        ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4"
                        : "right-6 top-[4.25rem] w-80",
                    )}
                  >
                    <div className="border-b border-[var(--line)] px-4 py-3">
                      <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
                        Recycle bin
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        Restore or delete forever. Auto-purge after 14 days.
                      </p>
                    </div>
                    {trashError && (
                      <p className="shrink-0 px-4 py-2 text-xs text-[var(--danger-text)]">
                        {trashError}
                      </p>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                      {trashLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--ink-muted)]">
                          <Loader2 className="size-4 animate-spin" />
                          Loading…
                        </div>
                      ) : trashItems.length === 0 ? (
                        <p className="px-2 py-8 text-center text-sm text-[var(--ink-muted)]">
                          Nothing in the recycle bin.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {trashItems.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--sky-wash)]"
                            >
                              <FileIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[var(--ink)]">
                                  {item.originalName}
                                </p>
                                <p className="text-[11px] text-[var(--ink-muted)]">
                                  {formatBytes(item.size)} ·{" "}
                                  {item.daysUntilPurge === 0
                                    ? "Purging soon"
                                    : `${item.daysUntilPurge} day${
                                        item.daysUntilPurge === 1 ? "" : "s"
                                      } left`}
                                </p>
                              </div>
                              {canManageTrashItem(item) && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Restore ${item.originalName}`}
                                    title="Restore to file list"
                                    disabled={
                                      trashRestoringId === item.id ||
                                      trashDeletingId === item.id
                                    }
                                    onClick={() => void onRestoreTrash(item.id)}
                                  >
                                    {trashRestoringId === item.id ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <RotateCcw className="size-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Delete ${item.originalName} permanently`}
                                    title="Delete forever"
                                    disabled={
                                      trashDeletingId === item.id ||
                                      trashRestoringId === item.id
                                    }
                                    onClick={() =>
                                      void onPermanentTrashDelete(item.id)
                                    }
                                  >
                                    {trashDeletingId === item.id ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <Trash2 className="size-3.5" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>,
                  document.body,
                )}
              {notesOpen &&
                notesMenuPos &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={notificationPanelRef}
                    className={cn(
                      "fixed z-[100] rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-2 text-left shadow-[0_18px_40px_-24px_rgba(12,48,42,0.45)]",
                      mobileLayout
                        ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 mx-auto w-auto max-w-sm"
                        : "w-72",
                    )}
                    style={
                      mobileLayout || !notesMenuPos
                        ? undefined
                        : { top: notesMenuPos.top, left: notesMenuPos.left }
                    }
                  >
                    <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                      Notifications
                    </p>
                    {accessNotifications.length === 0 &&
                    messageNotices.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-[var(--ink-muted)]">
                        No notifications
                      </p>
                    ) : (
                      <ul className="max-h-80 space-y-1.5 overflow-y-auto">
                        {messageNotices.map((note) => (
                          <li
                            key={`msg-${note.id}`}
                            className="rounded-lg bg-[rgba(159,232,112,0.18)] px-2.5 py-2"
                          >
                            <p className="text-sm text-[var(--ink)]">
                              {messageMentionsViewer(note, displayName)
                                ? "You were mentioned by "
                                : "Message from "}
                              <span className="font-semibold">
                                {note.displayName || guestLabel(note.senderId)}
                              </span>
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ink-muted)]">
                              {note.text}
                            </p>
                            <div className="mt-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setNotesOpen(false);
                                  setMessagesOpen(true);
                                  setMessageNotices([]);
                                  setUnreadMessages(0);
                                  pendingScrollMessageIdRef.current = note.id;
                                  setMessageFocus({
                                    id: note.id,
                                    label: messageMentionsViewer(note, displayName)
                                      ? "You were tagged"
                                      : "Notification",
                                  });
                                }}
                              >
                                {messageMentionsViewer(note, displayName)
                                  ? "View tagged message"
                                  : "Open in chat"}
                              </Button>
                            </div>
                          </li>
                        ))}
                        {accessNotifications.map((note) => (
                          <li
                            key={`${note.fileId}-${note.requesterId}`}
                            className="rounded-lg bg-[rgba(159,232,112,0.18)] px-2.5 py-2"
                          >
                            <p className="text-sm text-[var(--ink)]">
                              Access requested for{" "}
                              <span className="font-semibold">{note.fileName}</span>
                            </p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                disabled={accessBusyId === note.fileId}
                                onClick={() =>
                                  void respondAccess(note.fileId, note.requesterId, true)
                                }
                              >
                                Allow
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={accessBusyId === note.fileId}
                                onClick={() =>
                                  void respondAccess(note.fileId, note.requesterId, false)
                                }
                              >
                                Deny
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>,
                  document.body,
                )}
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label={
                  theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={toggleTheme}
                className="theme-toggle"
              >
                <span className="theme-toggle-thumb">
                  {theme === "dark" ? (
                    <Moon className="size-2.5" />
                  ) : (
                    <Sun className="size-2.5" />
                  )}
                </span>
              </button>
              </div>
            </div>
            <p className="mt-1.5 text-sm leading-snug text-[var(--ink-muted)] lg:text-[0.95rem]">
              Move any file across your Wi‑Fi — originals untouched.
            </p>
          </header>

          <section
            className={cn(
              "animate-panel min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 shadow-[0_14px_36px_-24px_rgba(12,48,42,0.35)] sm:px-5",
              copied && "copy-flash",
            )}
            style={{ animationDelay: "70ms" }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                <span className="wifi-chip-pulse mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(159,232,112,0.42)] text-[var(--ink)] sm:mt-0">
                  <Wifi className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">
                      Same Wi‑Fi link
                    </span>
                    <span className="hidden text-xs text-[var(--ink-soft)] lg:inline">
                      Open on the other device · byte-identical transfer
                    </span>
                  </div>
                  {networkError && !primaryUrl ? (
                    <p className="mt-1 text-sm text-[var(--danger-text)]">{networkError}</p>
                  ) : primaryUrl ? (
                    <p className="mt-0.5 truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)] sm:text-xl">
                      {primaryUrl}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      Detecting LAN address…
                    </p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)] lg:hidden">
                    Run vDrop on one laptop, then open this address on the other.
                  </p>
                  {secondaryAddresses.length > 0 && (
                    <p className="mt-1 hidden truncate text-[11px] text-[var(--ink-muted)] lg:block">
                      Also{" "}
                      {secondaryAddresses
                        .map((a) => a.url)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={copyUrl}
                disabled={!primaryUrl}
                className="shrink-0"
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </section>
        </div>

        {nicknameModalOpen && messagesOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-5 shadow-xl">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                Your nickname
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Shown in the vDrop group chat on this Wi‑Fi.
              </p>
              <input
                type="text"
                value={nicknameDraft}
                onChange={(e) =>
                  setNicknameDraft(e.target.value.slice(0, 40))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNickname();
                }}
                placeholder="e.g. Alex"
                className="mt-4 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent-signal)]"
                autoFocus
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNicknameModalOpen(false)}
                >
                  Later
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!nicknameDraft.trim()}
                  onClick={saveNickname}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {messagesOpen && !mobileLayout && (
          <div
            className="vdrop-phone-chassis pointer-events-none hidden min-[900px]:block"
            aria-hidden
          />
        )}

        {messagesOpen && (
          <section
            className={cn(
              "vdrop-chat vdrop-chat-wallpaper flex min-h-[220px] w-full flex-col overflow-hidden border border-[var(--line)]",
              mobileLayout
                ? "vdrop-chat-mobile animate-rise-delay max-h-[min(38vh,360px)] rounded-[1.35rem] shadow-[0_18px_40px_-28px_rgba(12,48,42,0.3)]"
                : "vdrop-phone-mounted max-[899px]:hidden min-[900px]:flex",
            )}
            style={mobileLayout ? { animationDelay: "90ms" } : undefined}
          >
            <div className="vdrop-chat-head flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[rgba(159,232,112,0.12)] px-3 py-2.5 sm:px-4 min-[900px]:gap-2 min-[900px]:px-3">
              <div className="min-w-0">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)]">
                  vDrop group
                </h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  {mobileLayout
                    ? `Everyone on this Wi‑Fi · ${deviceLabel}`
                    : "Everyone on this Wi‑Fi"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMessagesOpen(false)}
              >
                Close
              </Button>
            </div>
            <div
              ref={messagesListRef}
              className="vdrop-chat-messages min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4"
            >
              {messages.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-[var(--ink-muted)]">
                  No messages yet. Say hi to everyone on vDrop.
                </p>
              ) : (
                messages.map((msg) => {
                  const myChatName = displayName || "You";
                  const senderName = messageDisplayName(msg, myChatName);
                  const label = msg.deviceLabel || "Browser";
                  const taggedYou = messageMentionsViewer(msg, displayName);
                  const isFocused = messageFocus?.id === msg.id;
                  const replyTargetId =
                    msg.replyPreview?.id ?? msg.replyToId ?? null;
                  return (
                    <div
                      key={msg.id}
                      id={`vdrop-msg-${msg.id}`}
                      className={cn(
                        "group/msg flex scroll-mt-3 flex-col gap-1",
                        msg.isMine ? "items-end" : "items-start",
                        isFocused && "vdrop-msg-target",
                      )}
                    >
                      {isFocused && messageFocus?.label && (
                        <span
                          className={cn(
                            "max-w-[min(100%,28rem)] rounded-full bg-[var(--accent-signal)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--on-accent)]",
                            msg.isMine ? "self-end" : "self-start",
                          )}
                        >
                          {messageFocus.label}
                        </span>
                      )}
                      <div
                        className={cn(
                          "flex max-w-[min(100%,28rem)] items-end gap-1",
                          msg.isMine ? "flex-row-reverse" : "flex-row",
                        )}
                      >
                        <div
                          className={cn(
                            "vdrop-msg-bubble relative max-w-full rounded-2xl px-3 py-2 text-sm shadow-sm",
                            msg.isMine
                              ? "vdrop-msg-bubble--mine rounded-br-md"
                              : "rounded-bl-md bg-[var(--panel-strong)] text-[var(--ink)]",
                            taggedYou &&
                              "ring-2 ring-[rgba(159,232,112,0.75)] ring-offset-1 ring-offset-[var(--foam)]",
                          )}
                        >
                          <p className="mb-1 text-[11px] font-medium text-[var(--ink-muted)]">
                            {msg.isMine ? (
                              <span>You</span>
                            ) : (
                              <button
                                type="button"
                                className="font-semibold text-[var(--ink)] hover:underline"
                                onClick={() => insertMention(senderName)}
                              >
                                {senderName}
                              </button>
                            )}
                            {mobileLayout && (
                              <>
                                <span className="mx-1 opacity-40">·</span>
                                <span>{label}</span>
                              </>
                            )}
                            <span className="mx-1.5 opacity-40">·</span>
                            <span suppressHydrationWarning>
                              {formatUploadedAt(msg.createdAt)}
                            </span>
                          </p>
                          {msg.replyPreview && (
                            <button
                              type="button"
                              className="mb-1.5 w-full rounded-lg border-l-2 border-[var(--accent-signal)] bg-black/5 px-2 py-1 text-left text-[11px] transition-colors hover:bg-black/10"
                              title="Jump to original message"
                              onClick={() => {
                                if (replyTargetId) {
                                  scrollToMessage(replyTargetId, "Replying to this");
                                }
                              }}
                            >
                              <span className="font-semibold">
                                {msg.replyPreview.displayName}
                              </span>
                              <p className="line-clamp-2 opacity-80">
                                {msg.replyPreview.text}
                              </p>
                            </button>
                          )}
                          <p className="whitespace-pre-wrap break-words leading-relaxed">
                            {formatMessageBody(msg.text, {
                              displayName,
                              onMentionClick: jumpToMentionAuthor,
                            })}
                          </p>
                          {msg.reactions.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {msg.reactions.map((r) => (
                                <button
                                  key={`${msg.id}-${r.emoji}`}
                                  type="button"
                                  className="inline-flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-xs"
                                  onClick={() =>
                                    void reactToMessage(msg.id, r.emoji)
                                  }
                                >
                                  <span>{r.emoji}</span>
                                  <span className="text-[10px] text-[var(--ink-muted)]">
                                    {r.deviceIds.length}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          {msg.isMine && (
                            <span className="mt-1 inline-flex items-center justify-end gap-0.5">
                              {msg.tick === "sent" && (
                                <Check
                                  className="size-3.5 text-[var(--ink-muted)]"
                                  strokeWidth={2.4}
                                />
                              )}
                              {msg.tick === "delivered" && (
                                <CheckCheck
                                  className="size-3.5 text-[var(--ink-muted)]"
                                  strokeWidth={2.4}
                                />
                              )}
                              {msg.tick === "read" && (
                                <CheckCheck
                                  className="size-3.5"
                                  style={{ color: "#34B7F1" }}
                                  strokeWidth={2.4}
                                />
                              )}
                            </span>
                          )}
                        </div>
                        <div className="mb-0.5 flex shrink-0 flex-col gap-0.5 opacity-80 transition-opacity group-hover/msg:opacity-100">
                          <button
                            type="button"
                            onClick={() => void copyMessageText(msg)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--sky-wash)]"
                            aria-label="Copy message"
                          >
                            {copiedItemId === `msg:${msg.id}` ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo({
                                id: msg.id,
                                text: msg.text,
                                displayName: senderName,
                              });
                            }}
                            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--sky-wash)]"
                            aria-label="Reply"
                          >
                            <CornerDownRight className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setReactionPickerId((cur) =>
                                cur === msg.id ? null : msg.id,
                              )
                            }
                            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--sky-wash)]"
                            aria-label="React"
                          >
                            <Smile className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      {reactionPickerId === msg.id && (
                        <div
                          className={cn(
                            "flex flex-wrap gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-1 shadow-sm",
                            msg.isMine ? "mr-9" : "ml-9",
                          )}
                        >
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="rounded-md px-2 py-1 text-base hover:bg-[var(--sky-wash)]"
                              onClick={() => void reactToMessage(msg.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {messageError && (
              <p className="shrink-0 px-4 pb-1 text-xs text-[var(--danger-text)]">
                {messageError}
              </p>
            )}
            {replyTo && (
              <div className="flex shrink-0 items-start gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-3 py-2 sm:px-4">
                <div className="min-w-0 flex-1 border-l-2 border-[var(--accent-signal)] pl-2 text-xs">
                  <p className="font-semibold text-[var(--ink)]">
                    Replying to {replyTo.displayName}
                  </p>
                  <p className="line-clamp-2 text-[var(--ink-muted)]">
                    {replyTo.text}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--sky-wash)]"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTo(null)}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <form
              className="vdrop-chat-compose flex shrink-0 items-end gap-2 border-t border-[var(--line)] bg-[var(--panel-strong)]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <textarea
                value={messageDraft}
                onChange={(e) =>
                  setMessageDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                placeholder={
                  displayName
                    ? "Message the group…"
                    : "Set a nickname to send messages"
                }
                className="max-h-28 min-h-10 flex-1 resize-y rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent-signal)]"
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={
                  !deviceId || sendingMessage || !displayName.trim()
                }
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  !deviceId ||
                  sendingMessage ||
                  !messageDraft.trim() ||
                  !displayName.trim()
                }
                className="shrink-0"
              >
                {sendingMessage ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )}
                Send
              </Button>
            </form>
          </section>
        )}

        {/* Work area: fills remaining laptop viewport */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[900px]:gap-5 min-[900px]:min-h-0">
          <section
            ref={dropSectionRef}
            className="animate-rise-delay flex min-h-0 flex-col gap-3"
            style={{ animationDelay: "120ms" }}
          >
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  void handleFiles(e.dataTransfer.files);
                }
              }}
              className={cn(
                "vdrop-drop relative flex min-h-[240px] flex-1 overflow-hidden rounded-[1.35rem] border-2 border-dashed px-5 py-8 text-center transition-[border-color,transform,box-shadow] duration-300 sm:min-h-[280px] lg:min-h-0 lg:py-6",
                dragOver
                  ? "translate-y-[-2px] border-[var(--accent-signal)] shadow-[0_22px_48px_-24px_rgba(12,48,42,0.4)]"
                  : "border-[var(--line)]",
              )}
            >
              <div
                aria-hidden
                className="vdrop-drop-bg pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/60"
              />
              <div className="vdrop-drop-card relative m-auto flex w-full max-w-md flex-col items-center px-2 py-2 sm:px-4">
                <div className="vdrop-drop-card-art mb-4 w-full max-w-sm overflow-hidden rounded-2xl border border-white/25 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
                  <img
                    src={
                      theme === "dark"
                        ? "/dropzone-card-dark.webp"
                        : "/dropzone-card-light.webp"
                    }
                    alt=""
                    width={480}
                    height={270}
                    className="aspect-[16/11] max-h-48 w-full object-cover sm:max-h-52"
                  />
                </div>
                <div className="flex w-full max-w-md shrink-0 flex-col items-center rounded-2xl bg-black/25 px-5 py-4 text-center backdrop-blur-[2px]">
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-white sm:text-2xl lg:text-[1.75rem]">
                  Drop any file here
                </h2>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-white">
                  Photos, videos, PDFs, zips — raw bytes, nothing re-encoded.
                </p>

                <div className="mt-4 flex flex-col items-center gap-2.5">
                  <input
                    id="vdrop-file-input"
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void handleFiles(e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button type="button" size="lg" asChild>
                      <label htmlFor="vdrop-file-input" className="cursor-pointer">
                        Choose files
                      </label>
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      title="Refresh file list"
                      aria-label="Refresh file list"
                      disabled={refreshing}
                      onClick={() => void onRefresh()}
                      className="border-white/35 bg-black/25 text-white hover:bg-black/40 hover:text-white"
                    >
                      {refreshing ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                    </Button>
                    {deletableFiles.length > 0 && (
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        disabled={!canBulkDelete || bulkDeleting}
                        aria-label={
                          canBulkDelete
                            ? `Delete ${deletableSelectedIds.length} selected`
                            : "Select files to delete"
                        }
                        title={
                          canBulkDelete
                            ? `Delete ${deletableSelectedIds.length} selected`
                            : "Select files to delete"
                        }
                        onClick={() => void onDeleteMany(deletableSelectedIds)}
                        className="border-white/35 bg-black/25 text-white hover:bg-black/40 hover:text-white disabled:opacity-40"
                      >
                        {bulkDeleting ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                      </Button>
                    )}
                  </div>
                  <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
                    Up to 2 GB · binary-safe
                  </span>
                </div>
                </div>
              </div>
            </div>

            {uploads.length > 0 && (
              <ul className="max-h-28 space-y-2 overflow-y-auto lg:max-h-32">
                {uploads.map((u) => (
                  <li
                    key={u.key}
                    className="file-row-enter rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-[var(--ink)]">
                        {u.name}
                      </span>
                      <span className="shrink-0 text-[var(--ink-muted)]">
                        {u.status === "error"
                          ? "Failed"
                          : u.status === "done"
                            ? "Done"
                            : `${u.progress}%`}
                      </span>
                    </div>
                    {u.status !== "error" ? (
                      <Progress value={u.progress} />
                    ) : (
                      <p className="text-xs text-[var(--danger-text)]">{u.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="animate-rise-delay flex min-h-0 flex-col gap-2.5"
            style={{ animationDelay: "170ms" }}
          >
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--ink)] lg:text-[1.75rem]">
                  Ready to download
                </h2>
                <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                  Select files or download everything at once.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {files.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!someSelected}
                      onClick={() => downloadBulk([...selectedIds])}
                    >
                      <Download />
                      {selectedIds.size > 0
                        ? `Selected (${selectedIds.size})`
                        : "Selected"}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={files.length === 0}
                      onClick={() => downloadBulk(files.map((f) => f.id))}
                    >
                      <Download />
                      All
                    </Button>
                    {canBulkDelete && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={bulkDeleting}
                        aria-label={`Move ${deletableSelectedIds.length} selected to recycle bin`}
                        title="Move to recycle bin"
                        onClick={() => void onDeleteMany(deletableSelectedIds)}
                      >
                        {bulkDeleting ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        Delete
                      </Button>
                    )}
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={trashOpen}
                  onClick={() => {
                    setTrashOpen((open) => !open);
                    setMessagesOpen(false);
                    setNotesOpen(false);
                  }}
                >
                  <Recycle />
                  Bin
                  {trashMineCount > 0 ? ` (${trashMineCount})` : ""}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onRefresh()}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            {listError && (
              <div className="shrink-0 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]">
                {listError}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-3"
                  onClick={() => void onRefresh()}
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel-strong)] shadow-[0_18px_40px_-28px_rgba(12,48,42,0.3)] lg:min-h-0">
              {showInitialLoading ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--ink-muted)]">
                  <Loader2 className="size-4 animate-spin" />
                  Loading files…
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                  <FileIcon className="mb-3 size-8 text-[var(--ink-muted)] opacity-70" />
                  <p className="font-medium text-[var(--ink-soft)]">
                    Nothing shared yet
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--ink-muted)]">
                    Drop a file on the left and it shows up here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors hover:bg-[var(--sky-wash)]"
                      aria-label={allSelected ? "Deselect all files" : "Select all files"}
                    >
                      {allSelected ? (
                        <CheckSquare className="size-5 text-[var(--ink)]" />
                      ) : someSelected ? (
                        <CheckSquare className="size-5 text-[var(--ink-muted)]" />
                      ) : (
                        <Square className="size-5" />
                      )}
                    </button>
                    <p className="min-w-0 flex-1 text-sm text-[var(--ink-muted)]">
                      {allSelected
                        ? "All files selected"
                        : someSelected
                          ? `${selectedIds.size} selected`
                          : `${files.length} file${files.length === 1 ? "" : "s"} ready`}
                    </p>
                    {someSelected && canBulkDelete && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={bulkDeleting}
                        aria-label={`Delete ${deletableSelectedIds.length} selected`}
                        title={`Delete ${deletableSelectedIds.length} selected`}
                        onClick={() => void onDeleteMany(deletableSelectedIds)}
                      >
                        {bulkDeleting ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        Delete
                      </Button>
                    )}
                  </div>
                  <ul className="min-h-0 flex-1 divide-y divide-[var(--line)] overflow-y-auto">
                    {files.map((file, index) => {
                      const selected = selectedIds.has(file.id);
                      const tick = tickStateFor(file);
                      const lockedAway = Boolean(
                        file.locked && file.canAccess === false,
                      );
                      return (
                        <li
                          key={file.id}
                          className={cn(
                            "group/file file-row-enter relative flex flex-col gap-2.5 px-4 py-3 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between sm:px-5",
                            selected && "bg-[rgba(159,232,112,0.14)]",
                          )}
                          style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                        >
                          <div className="flex min-w-0 items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleSelected(file.id)}
                              disabled={lockedAway}
                              className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] transition-transform duration-200 hover:scale-110 hover:bg-[var(--sky-wash)] disabled:opacity-40"
                              aria-label={
                                selected
                                  ? `Deselect ${file.originalName}`
                                  : `Select ${file.originalName}`
                              }
                              aria-pressed={selected}
                            >
                              {selected ? (
                                <CheckSquare className="size-5 text-[var(--ink)]" />
                              ) : (
                                <Square className="size-5" />
                              )}
                            </button>
                            <FileThumb file={file} deviceId={deviceId} />
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "truncate font-semibold text-[var(--ink)]",
                                  lockedAway && "select-none blur-[6px]",
                                )}
                                onClick={
                                  lockedAway
                                    ? () => onLockedNameClick(file.id)
                                    : undefined
                                }
                              >
                                {file.originalName}
                              </p>
                              <p
                                className="mt-0.5 text-xs text-[var(--ink-muted)]"
                                suppressHydrationWarning
                              >
                                {formatUploadedAt(file.createdAt)}
                                <span className="mx-1.5 opacity-40">·</span>
                                {formatBytes(file.size)}
                                {file.isUploader && (
                                  <>
                                    <span className="mx-1.5 opacity-40">·</span>
                                    <span>you uploaded</span>
                                  </>
                                )}
                              </p>
                              {!lockedAway && (
                                <p
                                  className="mt-0.5 truncate text-[11px] text-[var(--ink-muted)]"
                                  title={file.sha256}
                                >
                                  {file.mimeType || "unknown"}
                                  <span className="mx-1.5 opacity-40">·</span>
                                  <span className="font-mono">
                                    SHA-256 {shortHash(file.sha256)}
                                  </span>
                                </p>
                              )}
                              {lockedAway && pinFileId === file.id && (
                                <form
                                  className="mt-2 flex items-center gap-1"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void submitPin(file.id);
                                  }}
                                >
                                  <input
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    autoFocus
                                    value={pinValue}
                                    onChange={(e) => {
                                      setPinValue(e.target.value);
                                      setPinError(null);
                                    }}
                                    className="h-7 w-16 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent-signal)]"
                                    aria-label="Code"
                                  />
                                  <Button
                                    type="submit"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={accessBusyId === file.id}
                                  >
                                    Go
                                  </Button>
                                  {pinError && (
                                    <span className="text-[11px] text-[var(--danger-text)]">
                                      {pinError}
                                    </span>
                                  )}
                                </form>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                            {lockedAway ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  accessBusyId === file.id || file.requestPending
                                }
                                onClick={() => void requestAccess(file.id)}
                              >
                                {file.requestPending ? "Requested" : "Request"}
                              </Button>
                            ) : (
                              <>
                                <Button variant="outline" size="sm" asChild>
                                  <a
                                    href={fileUrl(file.id, deviceId)}
                                    download={file.originalName}
                                    onClick={() => onDownload([file.id])}
                                  >
                                    <Download />
                                    Download
                                  </a>
                                </Button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--sky-wash)] hover:text-[var(--ink)] disabled:opacity-50"
                                  title={
                                    isImageFile(file)
                                      ? "Copy image to clipboard"
                                      : "Copy file to clipboard"
                                  }
                                  aria-label={
                                    isImageFile(file)
                                      ? `Copy ${file.originalName} image`
                                      : `Copy ${file.originalName}`
                                  }
                                  disabled={copyBusyId === file.id}
                                  onClick={() => void copySharedFile(file)}
                                >
                                  {copyBusyId === file.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : copiedItemId === `file:${file.id}` ? (
                                    <Check className="size-3.5 text-[var(--ink)]" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                </button>
                              </>
                            )}
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center"
                              title={
                                tick === "downloaded"
                                  ? "Downloaded on this device"
                                  : tick === "uploaded"
                                    ? "Downloaded by someone else"
                                    : undefined
                              }
                              aria-label={
                                tick === "downloaded"
                                  ? "Downloaded on this device"
                                  : tick === "uploaded"
                                    ? "Downloaded by someone else"
                                    : undefined
                              }
                              aria-hidden={tick === "none"}
                            >
                              {tick !== "none" && (
                                <CheckCheck
                                  className={cn(
                                    "size-3.5",
                                    tick === "downloaded" && "text-[#34B7F1]",
                                    tick === "uploaded" && "text-[#F59E0B]",
                                  )}
                                  strokeWidth={2.4}
                                />
                              )}
                            </span>
                            {file.isUploader && (
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--sky-wash)]",
                                  file.locked
                                    ? "text-[var(--ink)]"
                                    : "text-[var(--ink-muted)]",
                                )}
                                title={
                                  file.locked
                                    ? "Locked. Click to unlock"
                                    : "Unlocked. Click to lock"
                                }
                                aria-label={
                                  file.locked
                                    ? "Locked. Click to unlock"
                                    : "Unlocked. Click to lock"
                                }
                                aria-pressed={Boolean(file.locked)}
                                disabled={accessBusyId === file.id}
                                onClick={() => void toggleLock(file)}
                              >
                                {file.locked ? (
                                  <Lock className="size-3.5" />
                                ) : (
                                  <Unlock className="size-3.5" />
                                )}
                              </button>
                            )}
                            {canDeleteFile(file) && (
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-7 w-7 rounded-md [&_svg]:size-3.5"
                                aria-label={`Move ${file.originalName} to recycle bin`}
                                title="Move to recycle bin"
                                disabled={
                                  deletingId === file.id || bulkDeleting
                                }
                                onClick={() => void onDelete(file.id)}
                              >
                                {deletingId === file.id ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Trash2 />
                                )}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      <nav
        className="vdrop-mobile-dock fixed inset-x-0 bottom-0 z-[90] min-[900px]:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto flex max-w-[1500px] items-center justify-around gap-1 px-3 py-2">
          <button
            type="button"
            aria-label="Drop files"
            aria-pressed={!messagesOpen && !notesOpen}
            onClick={() => {
              setMessagesOpen(false);
              setNotesOpen(false);
              dropSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="vdrop-dock-btn flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium"
          >
            <Home className="size-5 shrink-0" strokeWidth={2.25} />
            Home
          </button>
          <button
            type="button"
            aria-label="Messages"
            aria-pressed={messagesOpen}
            onClick={() => {
              setMessagesOpen((open) => !open);
              setNotesOpen(false);
            }}
            className="vdrop-dock-btn relative flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium"
          >
            <MessageCircle className="size-5 shrink-0" strokeWidth={2.25} />
            Chat
            {unreadMessages > 0 && (
              <span className="absolute right-1 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-signal)] px-1 text-[9px] font-semibold leading-4 text-[var(--on-accent)]">
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Notifications"
            aria-pressed={notesOpen}
            ref={(el) => {
              bellButtonRef.current = el;
            }}
            onClick={() => {
              setNotesOpen((open) => !open);
              setMessagesOpen(false);
            }}
            className="vdrop-dock-btn relative flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium"
          >
            <Bell className="size-5 shrink-0" strokeWidth={2.25} />
            Alerts
            {accessNotifications.length + messageNotices.length > 0 && (
              <span className="absolute right-1 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent-signal)] px-1 text-[9px] font-semibold leading-4 text-[var(--on-accent)]">
                {accessNotifications.length + messageNotices.length > 9
                  ? "9+"
                  : accessNotifications.length + messageNotices.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={
              theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            onClick={toggleTheme}
            className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[var(--ink)]"
          >
            <span className="theme-toggle scale-110">
              <span className="theme-toggle-thumb">
                {theme === "dark" ? (
                  <Moon className="size-2.5" strokeWidth={2.5} />
                ) : (
                  <Sun className="size-2.5" strokeWidth={2.5} />
                )}
              </span>
            </span>
            Theme
          </button>
        </div>
      </nav>
    </div>
  );
}
