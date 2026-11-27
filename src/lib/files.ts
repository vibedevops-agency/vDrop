import { createHash, randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "fs/promises";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  FILE_ACCESS_PIN,
  isDeviceId,
  isServerLocalClient,
  type AccessRequest,
} from "@/lib/access";

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_FILES = 100;

export type StoredFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  /** Peer downloads only (not the uploader). Drives the orange delivery tick. */
  downloadCount: number;
  /** Device that uploaded this file. */
  uploaderId: string;
  locked: boolean;
  /** Devices granted access while the file is locked. */
  allowedDeviceIds: string[];
  /** Pending access requests (uploader sees these). */
  pendingRequests: AccessRequest[];
};

/** Client-facing file row (may be redacted when locked). */
export type FileView = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  downloadCount: number;
  uploaderId: string;
  locked: boolean;
  canAccess: boolean;
  isUploader: boolean;
  requestPending: boolean;
  redacted: boolean;
  /** Only populated for the uploader. */
  pendingRequests: AccessRequest[];
  /** Delete, restore, or purge from recycle bin. */
  canManage: boolean;
};

type MetaStore = {
  files: StoredFile[];
};

export type TrashedFile = StoredFile & {
  deletedAt: string;
};

type TrashStore = {
  items: TrashedFile[];
};

export type TrashFileView = {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  deletedAt: string;
  daysUntilPurge: number;
  /** Same as {@link FileView.canManage} — uploader, legacy ownerless, or vDrop host PC. */
  isUploader: boolean;
  canManage: boolean;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const META_PATH = path.join(DATA_DIR, "meta.json");
const TRASH_PATH = path.join(DATA_DIR, "trash.json");

/** Days before trashed files are removed permanently (bytes on disk included). */
export const TRASH_RETENTION_DAYS = 14;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function assertSafeId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Invalid file id");
  }
  return id;
}

function storedPathFor(id: string): string {
  const safeId = assertSafeId(id);
  const resolved = path.resolve(FILES_DIR, safeId);
  if (!resolved.startsWith(path.resolve(FILES_DIR) + path.sep)) {
    throw new Error("Path traversal blocked");
  }
  return resolved;
}

async function ensureDataDirs(): Promise<void> {
  await mkdir(FILES_DIR, { recursive: true });
  try {
    await access(META_PATH);
  } catch {
    await writeFile(META_PATH, JSON.stringify({ files: [] } satisfies MetaStore, null, 2), "utf8");
  }
  try {
    await access(TRASH_PATH);
  } catch {
    await writeFile(
      TRASH_PATH,
      JSON.stringify({ items: [] } satisfies TrashStore, null, 2),
      "utf8",
    );
  }
}

function normalizeFile(file: StoredFile): StoredFile {
  return {
    ...file,
    downloadCount:
      typeof file.downloadCount === "number" && file.downloadCount >= 0
        ? file.downloadCount
        : 0,
    uploaderId: isDeviceId(file.uploaderId) ? file.uploaderId : "",
    locked: Boolean(file.locked),
    allowedDeviceIds: Array.isArray(file.allowedDeviceIds)
      ? file.allowedDeviceIds.filter(isDeviceId)
      : [],
    pendingRequests: Array.isArray(file.pendingRequests)
      ? file.pendingRequests.filter(
          (r): r is AccessRequest =>
            !!r &&
            isDeviceId(r.deviceId) &&
            typeof r.requestedAt === "string",
        )
      : [],
  };
}

async function readMeta(): Promise<MetaStore> {
  await ensureDataDirs();
  const raw = await readFile(META_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as MetaStore;
    if (!parsed || !Array.isArray(parsed.files)) {
      return { files: [] };
    }
    return { files: parsed.files.map((f) => normalizeFile(f)) };
  } catch {
    return { files: [] };
  }
}

async function writeMeta(store: MetaStore): Promise<void> {
  await ensureDataDirs();
  const tmp = `${META_PATH}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, META_PATH);
}

async function readTrash(): Promise<TrashStore> {
  await ensureDataDirs();
  const raw = await readFile(TRASH_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as TrashStore;
    if (!parsed || !Array.isArray(parsed.items)) {
      return { items: [] };
    }
    return {
      items: parsed.items.map((f) => ({
        ...normalizeFile(f),
        deletedAt:
          typeof f.deletedAt === "string" ? f.deletedAt : new Date(0).toISOString(),
      })),
    };
  } catch {
    return { items: [] };
  }
}

async function writeTrash(store: TrashStore): Promise<void> {
  await ensureDataDirs();
  const tmp = `${TRASH_PATH}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, TRASH_PATH);
}

function daysUntilTrashExpires(deletedAt: string): number {
  const deletedMs = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedMs)) return 0;
  const purgeAt = deletedMs + TRASH_RETENTION_MS;
  const remaining = purgeAt - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export function toTrashView(
  item: TrashedFile,
  deviceId: string | null,
  request?: Request | null,
): TrashFileView {
  const canManage = canManageFile(item, deviceId, request);
  return {
    id: item.id,
    originalName: item.originalName,
    size: item.size,
    mimeType: item.mimeType,
    deletedAt: item.deletedAt,
    daysUntilPurge: daysUntilTrashExpires(item.deletedAt),
    isUploader: canManage,
    canManage,
  };
}

/** Permanently remove trashed files older than the retention window. */
export async function purgeExpiredTrash(): Promise<number> {
  const trash = await readTrash();
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const keep: TrashedFile[] = [];
  const expiredIds: string[] = [];

  for (const item of trash.items) {
    const deletedMs = new Date(item.deletedAt).getTime();
    if (Number.isNaN(deletedMs) || deletedMs < cutoff) {
      expiredIds.push(item.id);
    } else {
      keep.push(item);
    }
  }

  if (expiredIds.length === 0) return 0;

  trash.items = keep;
  await writeTrash(trash);
  for (const id of expiredIds) {
    try {
      await unlink(storedPathFor(id));
    } catch {
      // orphan metadata already dropped
    }
  }
  return expiredIds.length;
}

export function canAccessFile(
  file: StoredFile,
  deviceId: string | null,
): boolean {
  if (!file.locked) return true;
  if (!deviceId) return false;
  if (file.uploaderId && file.uploaderId === deviceId) return true;
  return file.allowedDeviceIds.includes(deviceId);
}

export function canManageAsUploader(
  file: Pick<StoredFile, "uploaderId">,
  deviceId: string | null,
): boolean {
  if (!deviceId) return false;
  if (!file.uploaderId) return true;
  return file.uploaderId === deviceId;
}

export function canManageFile(
  file: Pick<StoredFile, "uploaderId">,
  deviceId: string | null,
  request?: Request | null,
): boolean {
  if (request && isServerLocalClient(request) && deviceId) return true;
  return canManageAsUploader(file, deviceId);
}

export function toFileView(
  file: StoredFile,
  deviceId: string | null,
  request?: Request | null,
): FileView {
  const isUploader = Boolean(deviceId && file.uploaderId === deviceId);
  const canManage = canManageFile(file, deviceId, request);
  const canAccess = canAccessFile(file, deviceId);
  const requestPending = Boolean(
    deviceId &&
      file.pendingRequests.some((r) => r.deviceId === deviceId),
  );

  if (canAccess) {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      createdAt: file.createdAt,
      downloadCount: file.downloadCount,
      uploaderId: file.uploaderId,
      locked: file.locked,
      canAccess: true,
      isUploader,
      requestPending: false,
      redacted: false,
      pendingRequests: isUploader ? file.pendingRequests : [],
      canManage,
    };
  }

  return {
    id: file.id,
    originalName: "Locked file",
    mimeType: "application/octet-stream",
    size: file.size,
    sha256: "",
    createdAt: file.createdAt,
    downloadCount: 0,
    uploaderId: "",
    locked: true,
    canAccess: false,
    isUploader: false,
    requestPending,
    redacted: true,
    pendingRequests: [],
    canManage: false,
  };
}

export async function listFiles(): Promise<StoredFile[]> {
  await purgeExpiredTrash();
  const store = await readMeta();
  return [...store.files].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function listFileViews(
  deviceId: string | null,
  request?: Request | null,
): Promise<FileView[]> {
  const files = await listFiles();
  return files.map((f) => toFileView(f, deviceId, request));
}

export async function getFile(id: string): Promise<StoredFile | null> {
  const store = await readMeta();
  return store.files.find((f) => f.id === id) ?? null;
}

export function openFileStream(id: string): Readable {
  return createReadStream(storedPathFor(id));
}

export function getStoredFilePath(id: string): string {
  return storedPathFor(id);
}

export async function getFilesByIds(ids: string[]): Promise<StoredFile[]> {
  const store = await readMeta();
  const byId = new Map(store.files.map((f) => [f.id, f]));
  const out: StoredFile[] = [];
  for (const id of ids) {
    const file = byId.get(id);
    if (file) out.push(file);
  }
  return out;
}

/** Move a live file into the recycle bin (bytes stay on disk until purge). */
export async function trashFile(id: string): Promise<boolean> {
  await purgeExpiredTrash();
  const store = await readMeta();
  const index = store.files.findIndex((f) => f.id === id);
  if (index === -1) return false;

  const [file] = store.files.splice(index, 1);
  await writeMeta(store);

  const trash = await readTrash();
  const existing = trash.items.findIndex((f) => f.id === id);
  const entry: TrashedFile = {
    ...file,
    deletedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    trash.items[existing] = entry;
  } else {
    trash.items.push(entry);
  }
  await writeTrash(trash);
  return true;
}

export async function restoreTrashedFile(id: string): Promise<boolean> {
  await purgeExpiredTrash();
  const trash = await readTrash();
  const index = trash.items.findIndex((f) => f.id === id);
  if (index === -1) return false;

  const [item] = trash.items.splice(index, 1);
  await writeTrash(trash);

  const store = await readMeta();
  if (store.files.some((f) => f.id === id)) {
    return true;
  }

  const { deletedAt: _deletedAt, ...file } = item;
  store.files.push(file);
  await writeMeta(store);
  return true;
}

export async function listTrashedFiles(
  deviceId: string | null,
  request?: Request | null,
): Promise<TrashFileView[]> {
  await purgeExpiredTrash();
  const trash = await readTrash();
  return trash.items
    .map((f) => toTrashView(f, deviceId, request))
    .sort(
      (a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    );
}

export async function getTrashedFile(id: string): Promise<TrashedFile | null> {
  await purgeExpiredTrash();
  const trash = await readTrash();
  return trash.items.find((f) => f.id === id) ?? null;
}

export async function permanentlyDeleteTrashedFile(id: string): Promise<boolean> {
  await purgeExpiredTrash();
  const trash = await readTrash();
  const index = trash.items.findIndex((f) => f.id === id);
  if (index === -1) return false;

  trash.items.splice(index, 1);
  await writeTrash(trash);

  try {
    await unlink(storedPathFor(id));
  } catch {
    // metadata is source of truth for listing
  }
  return true;
}

/** Hard-delete (skip recycle bin) — used only by automatic purge. */
export async function deleteFile(id: string): Promise<boolean> {
  const inTrash = await getTrashedFile(id);
  if (inTrash) {
    return permanentlyDeleteTrashedFile(id);
  }
  const store = await readMeta();
  const index = store.files.findIndex((f) => f.id === id);
  if (index === -1) return false;

  store.files.splice(index, 1);
  await writeMeta(store);

  try {
    await unlink(storedPathFor(id));
  } catch {
    // File may already be gone; metadata is source of truth for listing.
  }
  return true;
}

function sanitizeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"|?*\\/]/g, "_").trim();
  return base || "file";
}

function guessMime(name: string, provided?: string | null): string {
  if (provided && provided !== "application/octet-stream") return provided;
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".txt": "text/plain",
  };
  return map[ext] ?? provided ?? "application/octet-stream";
}

export class FileLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileLimitError";
  }
}

export async function saveUploadedFile(input: {
  stream: Readable;
  originalName: string;
  mimeType?: string | null;
  uploaderId?: string | null;
}): Promise<StoredFile> {
  await ensureDataDirs();
  const store = await readMeta();
  if (store.files.length >= MAX_FILES) {
    throw new FileLimitError(`Storage is full (max ${MAX_FILES} files). Delete some files first.`);
  }

  const id = randomUUID();
  const destination = storedPathFor(id);
  const tmpPath = `${destination}.uploading`;
  const hash = createHash("sha256");
  let size = 0;

  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_FILE_SIZE) {
        callback(new FileLimitError("File exceeds the 2 GB limit."));
        return;
      }
      hash.update(buf);
      callback(null, buf);
    },
  });

  const writeStream = createWriteStream(tmpPath);

  try {
    await pipeline(input.stream, hasher, writeStream);
  } catch (err) {
    writeStream.destroy();
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }

  if (size > MAX_FILE_SIZE) {
    try {
      await unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new FileLimitError("File exceeds the 2 GB limit.");
  }

  await rename(tmpPath, destination);

  const record: StoredFile = {
    id,
    originalName: sanitizeOriginalName(input.originalName),
    mimeType: guessMime(input.originalName, input.mimeType),
    size,
    sha256: hash.digest("hex"),
    createdAt: new Date().toISOString(),
    downloadCount: 0,
    uploaderId: isDeviceId(input.uploaderId) ? input.uploaderId : "",
    locked: false,
    allowedDeviceIds: [],
    pendingRequests: [],
  };

  // Re-check count in case of concurrent uploads
  const latest = await readMeta();
  if (latest.files.length >= MAX_FILES) {
    try {
      await unlink(destination);
    } catch {
      // ignore
    }
    throw new FileLimitError(`Storage is full (max ${MAX_FILES} files). Delete some files first.`);
  }

  latest.files.push(record);
  await writeMeta(latest);
  return record;
}

/**
 * Count a peer download so the uploader's tick can turn orange.
 * Call only from an explicit client ack — never from raw file GET (avoids
 * prefetch / link probes falsely marking files as delivered).
 */
export async function recordPeerDownloads(ids: string[]): Promise<StoredFile[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids.map((id) => assertSafeId(id)))];
  const store = await readMeta();
  const updated: StoredFile[] = [];
  for (const id of unique) {
    const file = store.files.find((f) => f.id === id);
    if (!file) continue;
    file.downloadCount = (file.downloadCount ?? 0) + 1;
    updated.push(file);
  }
  if (updated.length > 0) await writeMeta(store);
  return updated;
}

export async function setFileLocked(
  id: string,
  deviceId: string,
  locked: boolean,
): Promise<StoredFile> {
  const store = await readMeta();
  const file = store.files.find((f) => f.id === assertSafeId(id));
  if (!file) throw new Error("File not found");
  if (!file.uploaderId || file.uploaderId !== deviceId) {
    throw new Error("Only the uploader can lock this file");
  }
  file.locked = locked;
  if (!locked) {
    file.pendingRequests = [];
    // keep allowedDeviceIds so re-lock stays consistent, or clear — clear on unlock
    file.allowedDeviceIds = [];
  }
  await writeMeta(store);
  return file;
}

export async function requestFileAccess(
  id: string,
  deviceId: string,
): Promise<StoredFile> {
  const store = await readMeta();
  const file = store.files.find((f) => f.id === assertSafeId(id));
  if (!file) throw new Error("File not found");
  if (!file.locked) throw new Error("File is not locked");
  if (file.uploaderId === deviceId) throw new Error("Uploader already has access");
  if (file.allowedDeviceIds.includes(deviceId)) {
    return file;
  }
  if (!file.pendingRequests.some((r) => r.deviceId === deviceId)) {
    file.pendingRequests.push({
      deviceId,
      requestedAt: new Date().toISOString(),
    });
    await writeMeta(store);
  }
  return file;
}

export async function respondFileAccess(
  id: string,
  uploaderId: string,
  requesterId: string,
  allow: boolean,
): Promise<StoredFile> {
  const store = await readMeta();
  const file = store.files.find((f) => f.id === assertSafeId(id));
  if (!file) throw new Error("File not found");
  if (!file.uploaderId || file.uploaderId !== uploaderId) {
    throw new Error("Only the uploader can respond to requests");
  }
  if (!isDeviceId(requesterId)) throw new Error("Invalid requester id");

  file.pendingRequests = file.pendingRequests.filter(
    (r) => r.deviceId !== requesterId,
  );
  if (allow && !file.allowedDeviceIds.includes(requesterId)) {
    file.allowedDeviceIds.push(requesterId);
  }
  await writeMeta(store);
  return file;
}

/** Silent PIN unlock — grants this device, never creates a pending request. */
export async function unlockFileWithPin(
  id: string,
  deviceId: string,
  pin: string,
): Promise<StoredFile> {
  if (pin !== FILE_ACCESS_PIN) {
    throw new Error("Incorrect pin");
  }
  const store = await readMeta();
  const file = store.files.find((f) => f.id === assertSafeId(id));
  if (!file) throw new Error("File not found");
  if (!file.locked) return file;
  if (file.uploaderId === deviceId) return file;

  file.pendingRequests = file.pendingRequests.filter(
    (r) => r.deviceId !== deviceId,
  );
  if (!file.allowedDeviceIds.includes(deviceId)) {
    file.allowedDeviceIds.push(deviceId);
  }
  await writeMeta(store);
  return file;
}
