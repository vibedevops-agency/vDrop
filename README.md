# vDrop 📡

Local Wi‑Fi file transfer and group chat. Run vDrop on one Windows PC; phones and other laptops on the same network open the LAN URL in a browser to upload, download, or chat. No cloud hosting required.

Files are stored **byte-identical** — no compression, resizing, or re-encoding. Any file type is supported.

**Repository:** [github.com/vibedevops-agency/vDrop](https://github.com/vibedevops-agency/vDrop)

## Requirements ✅

- **Node.js 20+** and npm
- Devices on the **same Wi‑Fi** / LAN 📶
- **Windows Firewall:** allow inbound TCP **1947** on private networks (the batch script can add a rule)

## Clone and run 🚀

```powershell
git clone https://github.com/vibedevops-agency/vDrop.git
cd vDrop
npm install
```

### File unlock PIN 🔐 (optional)

Some flows use a stealth unlock PIN. The **default in this repo is `0000`**. Change it before use on a real network:

```powershell
copy .env.example .env.local
# Edit .env.local — set FILE_ACCESS_PIN to your own value
```

Or set `FILE_ACCESS_PIN` in the environment before starting the server.

### Production-style start (build + listen on all interfaces)

```powershell
npm run vdrop
```

Or on Windows, double-click **`start-vdrop.bat`** (installs deps if needed, builds, opens the firewall rule, starts the server).

Then:

1. On the host PC, open [http://localhost:1947](http://localhost:1947) 💻
2. Copy the **Same Wi‑Fi** link from the page (e.g. `http://192.168.x.x:1947`)
3. On another device, open that URL 📱
4. Upload or download files, or use **Messages** for the shared chat 💬

### Development 🛠️

```powershell
npm run dev
```

Runs Next.js in dev mode on `0.0.0.0:1947` (webpack).

## npm scripts 📜

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server on port **1947** |
| `npm run build` | Production build |
| `npm run start` | Production server (`server.mjs`, all interfaces) |
| `npm run vdrop` | `build` then `start` |
| `npm run lint` | ESLint |

Default port: **1947** (`PORT` env var overrides).

## Limits and data 📦

| Limit | Value |
| --- | --- |
| Max file size | **2 GB** |
| Max stored files | **~100** |
| Recycle bin retention | **14 days** 🗑️ |

Uploaded files and chat live under **`data/`** (gitignored). Clone starts with empty `data/` placeholders only.

## API overview 🔌

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/files` | List files |
| `POST` | `/api/files` | Multipart upload (`file` field) |
| `GET` | `/api/files/[id]` | Download original bytes |
| `DELETE` | `/api/files/[id]` | Delete file |
| `GET` | `/api/files/zip?id=…` | Bulk ZIP download |
| `GET` | `/api/messages` | LAN chat history |
| `POST` | `/api/messages` | Send message |
| `POST` | `/api/messages/ack` | Delivered / read |
| `POST` | `/api/messages/react` | Reactions |
| `GET` | `/api/network` | LAN URLs for sharing |

## Troubleshooting 🔧

- **Peer cannot connect:** Same Wi‑Fi, correct LAN IP, firewall allows TCP **1947**.
- **Build fails:** Node 20+, delete `node_modules` and run `npm install` again.
- **Checksums:** Each upload shows **SHA-256** for integrity checks after transfer.

## Project layout 📁

```
vDrop/
├── src/           # Next.js app (UI + API routes)
├── public/        # Static assets (logo, wallpapers)
├── server.mjs     # Production HTTP server (IPv4 + IPv6)
├── data/          # Local uploads & chat (not in git)
└── start-vdrop.bat
```

## Security & privacy 🛡️

| Item | On GitHub? |
| --- | --- |
| `.env.local` / real PIN | ❌ gitignored |
| `.cursor/` IDE logs | ❌ gitignored |
| `data/` uploads & chat | ❌ gitignored |
| Default unlock PIN in code | ✅ `0000` placeholder only — set your own before LAN use |

No API keys, tokens, or personal paths are committed. Maintainer push scripts only **prompt** for credentials; they are not stored in the repo.

## Publishing (maintainers, two GitHub accounts) 🐙

This clone is wired **only** for [vibedevops-agency/vDrop](https://github.com/vibedevops-agency/vDrop):

- `credential.useHttpPath = true` (local) — credentials are keyed by repo path, not one global login for all of GitHub.
- `origin` uses `https://vibedevops-agency@github.com/...` so Git Credential Manager picks the **vibedevops-agency** entry.

Sign in once for this repo (does **not** remove other accounts / `gh` logins):

```powershell
powershell -ExecutionPolicy Bypass -File .\github-vdrop-login.ps1
```

If global Git uses **GitHub CLI** (`gh auth`) for another user, pushes from this folder should use:

```powershell
.\push-vdrop.ps1
```

That sets `GIT_CONFIG_GLOBAL` to `gitconfig-vdrop-push` for the command only (GCM for vibedevops-agency, `gh` unchanged elsewhere).

For a **personal** repo on the same PC, keep using `gh` or GCM with `https://YOUR_USER@github.com/YOUR_USER/repo.git` and local `credential.useHttpPath true`.

## License 📄

Published by [vibedevops-agency](https://github.com/vibedevops-agency). Add a `LICENSE` file here if you want an explicit open-source license.