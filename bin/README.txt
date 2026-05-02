AbyssFetch — bin/ folder
========================

Place the following executables in this folder:

  yt-dlp.exe   — YouTube downloader engine
  ffmpeg.exe   — Media processing (required for MP4 merging, MP3 conversion)
  ffprobe.exe  — Media probe tool (used by ffmpeg)

WHERE TO GET THEM
-----------------

yt-dlp.exe:
  https://github.com/yt-dlp/yt-dlp/releases/latest
  Download: yt-dlp.exe

ffmpeg.exe + ffprobe.exe (Windows 64-bit):
  https://www.gyan.dev/ffmpeg/builds/
  Download the "release essentials" build.
  Extract ffmpeg.exe and ffprobe.exe from the bin/ folder inside the archive.

  Alternative: https://github.com/BtbN/FFmpeg-Builds/releases
  Download: ffmpeg-master-latest-win64-gpl.zip

AFTER PLACING FILES
-------------------
Restart AbyssFetch. The status pills in the top-right will turn green when tools are detected.

NOTE: These executables are not included in the repository because they are
third-party tools distributed under their own licenses. You must download them
separately.
