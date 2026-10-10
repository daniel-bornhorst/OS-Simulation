# Content folder

Everything in this folder is added to the WebOS filesystem when it boots, at the same path.

```
content/home/user/Pictures/beach.jpg   →  ~/Pictures/beach.jpg
content/home/user/Music/song.mp3       →  ~/Music/song.mp3
content/home/user/Desktop/Notes.txt    →  on the desktop
```

## Adding files

1. Put the file in the folder where it should appear (create folders as needed).
2. If `npm run dev` is running, the page reloads with the new file. Otherwise, start it.
3. To publish, commit the file and push. GitHub Pages rebuilds with it included.

Files placed directly in `content/` (like this README) are ignored. Only files inside subfolders are added.

## Supported types

| Kind | Extensions | Opens in |
|---|---|---|
| Text | `.txt` `.md` `.json` `.csv` `.log` `.html` `.css` `.js` `.ts` | Text Editor |
| Photos | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.avif` `.bmp` `.svg` | Paint |
| Audio | `.mp3` `.m4a` `.aac` `.wav` `.ogg` `.flac` | Media Player |
| Video | `.mp4` `.webm` `.m4v` `.ogv` (`.mov` only if the browser supports it) | Media Player |
| Shortcut | `.app` (contents: an app id such as `terminal`) | Launches that app |

Text files are copied into the filesystem so they can be edited. Photos, audio and video stay as separate files and are streamed by URL.

Changes made inside WebOS are not saved back to this folder. Everything resets to this folder's contents on reload.

## Size tips

- GitHub rejects files over 100 MB, and a Pages site should stay under 1 GB in total.
- For video, MP4 (H.264 + AAC) or WebM plays in all major browsers. Compress before adding, for example:
  `ffmpeg -i input.mov -c:v libx264 -crf 28 -c:a aac -movflags +faststart output.mp4`
- Resize large photos to about 2000 px wide. Full-resolution camera files are slow to load.

The `Sample Tone.mp3`, `Test Pattern.mp4`, `Mandelbrot.jpg` and `From the content folder.txt` files are generated examples. Delete them whenever you like.
