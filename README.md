# AbyssFetch

> **Deep fetch. Local only. No installer required.**

A portable YouTube downloader that runs entirely from a USB drive or external disk. No cloud, no telemetry, no permanent installation. Built with Electron + Express + yt-dlp.

---

## Quick Start

### Portable Mode (USB Drive / External Disk)

1. Copy this folder to your USB drive or external disk.
2. Put these files in `bin/`:
   - `yt-dlp.exe` from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
   - `ffmpeg.exe` and `ffprobe.exe` from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) or [BtbN builds](https://github.com/BtbN/FFmpeg-Builds/releases)
3. First time only:
   - install [Node.js](https://nodejs.org)
   - open a terminal in this folder
   - run `npm install`
4. Launch with `start.bat` or `npm start`.

After the first setup, you usually only need step 4.

### Developer Mode

```bash
git clone https://github.com/yourrepo/abyssfetch
cd abyssfetch
npm install
npm start
```

---

## Folder Structure

```
abyssfetch/
├── bin/                      ← Place yt-dlp.exe, ffmpeg.exe, ffprobe.exe here
│   └── (empty - you supply these)
├── app/
│   ├── backend/
│   │   ├── server.js         ← Express API server (localhost:57315)
│   │   ├── downloader.js     ← yt-dlp wrapper
│   │   ├── queue.js          ← Download queue manager
│   │   ├── config.js         ← Config read/write
│   │   ├── validator.js      ← URL validation & sanitization
│   │   ├── diskcheck.js      ← Disk space checks
│   │   └── logger.js         ← Winston logger
│   └── frontend/
│       ├── index.html        ← Main UI
│       ├── styles.css        ← Ocean cyberpunk stylesheet
│       └── app.js            ← Frontend JS (no frameworks)
├── portable/
│   ├── config.json           ← Your settings (edit freely)
│   ├── queue.json            ← Download queue state
│   ├── history.json          ← Download history
│   └── logs/                 ← app.log, downloads.log
├── downloads/
│   ├── video/                ← MP4/WEBM downloads
│   ├── audio/                ← MP3/M4A downloads
│   ├── shorts/               ← YouTube Shorts downloads
│   └── temp/                 ← Temporary merge files
├── main.js                   ← Electron main process
├── preload.js                ← Electron preload (contextBridge)
├── package.json
├── start.bat                 ← Windows launcher script
└── README.md
```

---

## How It Works

1. **Electron** wraps the app in a native desktop window
2. **Express** runs a local-only API server on `127.0.0.1:57315` — not accessible from the network
3. The **frontend** (pure HTML/CSS/JS) communicates with the backend via `fetch` and Server-Sent Events
4. **yt-dlp** does all the heavy lifting — metadata fetching and downloading
5. **ffmpeg** merges video+audio streams for MP4/WEBM output
6. Progress is streamed in real-time to the UI via SSE

---

## Adding / Updating yt-dlp

1. Go to [github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases)
2. Download `yt-dlp.exe` (Windows) or `yt-dlp` (Linux/macOS)
3. Replace `bin/yt-dlp.exe` (or `bin/yt-dlp`) with the new file
4. On Linux/macOS: `chmod +x bin/yt-dlp`
5. Restart AbyssFetch

---

## Adding / Updating ffmpeg

**Option A – gyan.dev (recommended for Windows):**
1. Go to [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/)
2. Download `ffmpeg-release-essentials.zip`
3. Extract `ffmpeg.exe` and `ffprobe.exe` from the `bin/` folder inside the zip
4. Place both in AbyssFetch's `bin/` folder

**Option B – BtbN builds:**
1. Go to [github.com/BtbN/FFmpeg-Builds/releases](https://github.com/BtbN/FFmpeg-Builds/releases)
2. Download `ffmpeg-master-latest-win64-gpl.zip`
3. Extract `ffmpeg.exe` and `ffprobe.exe` and place in `bin/`

---

## First-Time Setup

```bash
# 1. Open a terminal in the app folder
cd /path/to/abyssfetch

# 2. Install dependencies
npm install

# 3. Start the app
npm start
# or on Windows:
start.bat
```

---

## Changing the Download Folder

Edit `portable/config.json`:

```json
{
  "downloadRoot": "D:/MyDownloads",
  "videoFolder": "D:/MyDownloads/video",
  "audioFolder": "D:/MyDownloads/audio",
  "shortsFolder": "D:/MyDownloads/shorts",
  "tempFolder": "D:/MyDownloads/temp"
}
```

You can also change folders in the Settings panel inside the app (gear icon, top-right).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "yt-dlp not found" pill is red | Place `yt-dlp.exe` in the `bin/` folder |
| MP4 downloads fail / no audio | Place `ffmpeg.exe` and `ffprobe.exe` in `bin/` |
| Cannot reach backend | Make sure no firewall blocks `127.0.0.1:57315` |
| Black window on startup | Update Electron: `npm install electron@latest` |
| `npm install` fails | Ensure Node.js >= 18 is installed |
| Download folder missing | App will create it; check `portable/config.json` |
| "Video unavailable" error | Video may be age-restricted, region-locked, or private |
| Slow downloads | YouTube-side throttle — this is normal |

Check `portable/logs/app.log` and `portable/logs/downloads.log` for detailed error output.

---

## Known Limitations

- **Windows only** for portable `.exe` builds (Linux/macOS work in dev mode)
- **No browser cookies** — age-restricted or member-only videos cannot be downloaded
- **No simultaneous downloads** — queue processes one item at a time
- **Playlists** — large playlists may take a long time; use the playlist limit setting
- **Live streams** — live videos cannot be downloaded while streaming
- **DRM content** — DRM-protected content cannot be downloaded (by design)

---

## Building a Portable Executable

```bash
npm run build
# Output: dist/AbyssFetch <version>.exe (portable, no installer)
```

---

## Privacy & Security

- The Express server binds to `127.0.0.1` **only** — no network exposure
- No analytics, no telemetry, no cloud connectivity
- No data leaves your machine
- Logs never contain raw URLs (only job IDs and status)
- All inputs are validated and sanitized before passing to yt-dlp
- yt-dlp/ffmpeg are called with argument arrays — never via shell string execution

---

## Legal Notice

> ⚠ **Use only for content you own, have permission to save, or are allowed to download under applicable law.**
>
> Downloading YouTube content may violate YouTube's Terms of Service. The authors of AbyssFetch are not responsible for how you use this software. Always respect copyright law and content creators' rights.
