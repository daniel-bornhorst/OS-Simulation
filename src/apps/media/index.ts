import type { AppDefinition } from '../../core/appRegistry';
import type { FSNode } from '../../core/storage';
import { basename, dirname, HOME, joinPath } from '../../core/vfs';
import { h } from '../../ui/dom';
import { glyph, icon } from '../../ui/icons';
import './style.css';

const isMedia = (node: FSNode) => node.type === 'file' && /^(audio|video)\//.test(node.mime ?? '');

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const hrs = Math.floor(seconds / 3600);
  const mm = hrs ? String(m).padStart(2, '0') : String(m);
  return `${hrs ? `${hrs}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Plays audio and video files, with a playlist of the other media in the same folder. */
export const mediaApp: AppDefinition = {
  id: 'media',
  name: 'Media Player',
  icon: 'media',
  fileTypes: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'mp4', 'm4v', 'webm', 'ogv', 'mov'],
  defaultSize: { width: 760, height: 500 },
  minSize: { width: 380, height: 280 },

  launch({ os, win, args }) {
    let playlist: string[] = [];
    let current: string | null = null;
    /** Folders the playlist is built from; refreshed when they change. */
    let sourceDirs: string[] = [];

    // One <video> element plays both; for audio it's hidden behind artwork.
    const media = h('video', { class: 'media-video', playsInline: true, preload: 'metadata' });
    const artTitle = h('div', { class: 'media-art-title' });
    const art = h('div', { class: 'media-art' }, icon('audio', 96), artTitle);
    const message = h('div', { class: 'media-message' });
    const stage = h('div', { class: 'media-stage' }, media, art, message);

    const listEl = h('div', { class: 'media-playlist-items' });
    const playlistPanel = h('aside', { class: 'media-playlist' }, h('div', { class: 'media-playlist-title' }, 'Playlist'), listEl);

    const playBtn = h('button', { class: 'media-btn media-play', title: 'Play (Space)', onclick: () => togglePlay() });
    const prevBtn = h('button', { class: 'media-btn', title: 'Previous (P)', onclick: () => step(-1) }, glyph('previous', 18));
    const nextBtn = h('button', { class: 'media-btn', title: 'Next (N)', onclick: () => step(1) }, glyph('next', 18));
    const seek = h('input', { class: 'media-seek', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Seek' });
    const elapsed = h('span', { class: 'media-time' }, '0:00');
    const duration = h('span', { class: 'media-time' }, '0:00');
    const nowPlaying = h('span', { class: 'media-now-playing' });
    const muteBtn = h('button', { class: 'media-btn', title: 'Mute (M)', onclick: () => (media.muted = !media.muted) });
    const volume = h('input', { class: 'media-volume', type: 'range', min: 0, max: 100, value: 100, 'aria-label': 'Volume' });
    const listBtn = h('button', { class: 'media-btn', title: 'Toggle playlist', onclick: () => root.classList.toggle('hide-playlist') }, glyph('list', 18));
    const fullBtn = h('button', { class: 'media-btn media-fullscreen', title: 'Full screen (F)', onclick: () => fullscreen() }, glyph('fullscreen', 18));

    const root = h(
      'div',
      { class: 'media', tabindex: 0 },
      h('div', { class: 'media-main' }, stage, playlistPanel),
      h(
        'div',
        { class: 'media-controls' },
        h('div', { class: 'media-seek-row' }, elapsed, seek, duration),
        h(
          'div',
          { class: 'media-button-row' },
          prevBtn,
          playBtn,
          nextBtn,
          nowPlaying,
          muteBtn,
          volume,
          listBtn,
          fullBtn,
        ),
      ),
    );
    win.body.append(root);

    // ---- playlist ------------------------------------------------------------

    function buildPlaylist() {
      playlist = sourceDirs
        .filter((dir) => os.fs.isDir(dir))
        .flatMap((dir) => os.fs.list(dir).filter(isMedia).map((n) => joinPath(dir, n.name)));
      if (current && !playlist.includes(current) && os.fs.exists(current)) playlist.unshift(current);
      renderPlaylist();
    }

    function renderPlaylist() {
      listEl.replaceChildren(
        ...playlist.map((path) => {
          const node = os.fs.stat(path)!;
          return h(
            'button',
            { class: `media-playlist-item${path === current ? ' is-current' : ''}`, title: path, onclick: () => load(path, true) },
            glyph(node.mime?.startsWith('video/') ? 'videos' : 'music', 14),
            h('span', null, node.name),
          );
        }),
      );
      if (!playlist.length) listEl.append(h('div', { class: 'media-playlist-empty' }, 'No audio or video here yet.'));
      prevBtn.disabled = nextBtn.disabled = playlist.length < 2;
    }

    // ---- playback ------------------------------------------------------------

    function load(path: string, autoplay: boolean) {
      const node = os.fs.stat(path);
      if (!node) return;
      current = path;
      const isVideo = node.mime?.startsWith('video/') ?? false;
      root.classList.toggle('is-video', isVideo);
      root.classList.toggle('is-audio', !isVideo);
      root.classList.remove('is-empty');
      artTitle.textContent = node.name;
      nowPlaying.textContent = node.name;
      message.textContent = '';
      win.setTitle(`${node.name} — Media Player`);
      media.src = os.fs.source(path);
      if (autoplay) media.play().catch(() => {});
      renderPlaylist();
    }

    function togglePlay() {
      if (!current) {
        if (playlist[0]) load(playlist[0], true);
        return;
      }
      media.paused ? media.play().catch(() => {}) : media.pause();
    }

    function step(delta: number) {
      if (!playlist.length) return;
      const i = current ? playlist.indexOf(current) : -1;
      load(playlist[(i + delta + playlist.length) % playlist.length], true);
    }

    function fullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen?.().catch(() => {});
    }

    const updatePlayButton = () => {
      playBtn.replaceChildren(glyph(media.paused ? 'play' : 'pause', 22));
      playBtn.title = media.paused ? 'Play (Space)' : 'Pause (Space)';
    };
    const updateVolume = () => {
      muteBtn.replaceChildren(glyph(media.muted || media.volume === 0 ? 'mute' : 'volume', 18));
      volume.value = String(media.muted ? 0 : Math.round(media.volume * 100));
    };
    let seeking = false;
    const updateTime = () => {
      elapsed.textContent = formatTime(media.currentTime);
      duration.textContent = formatTime(media.duration);
      if (!seeking && media.duration) seek.value = String((media.currentTime / media.duration) * 1000);
    };

    media.addEventListener('play', updatePlayButton);
    media.addEventListener('pause', updatePlayButton);
    media.addEventListener('timeupdate', updateTime);
    media.addEventListener('loadedmetadata', updateTime);
    media.addEventListener('volumechange', updateVolume);
    media.addEventListener('ended', () => {
      const i = current ? playlist.indexOf(current) : -1;
      if (i >= 0 && i < playlist.length - 1) load(playlist[i + 1], true);
    });
    media.addEventListener('error', () => {
      if (!current) return;
      message.textContent = `Can't play ${basename(current)}. This browser may not support the format.`;
    });
    media.addEventListener('click', togglePlay);

    seek.addEventListener('input', () => {
      seeking = true;
      if (media.duration) media.currentTime = (Number(seek.value) / 1000) * media.duration;
    });
    seek.addEventListener('change', () => (seeking = false));
    volume.addEventListener('input', () => {
      media.volume = Number(volume.value) / 100;
      media.muted = media.volume === 0;
    });

    root.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.key !== ' ') return;
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        ArrowLeft: () => (media.currentTime = Math.max(0, media.currentTime - 5)),
        ArrowRight: () => (media.currentTime = Math.min(media.duration || 0, media.currentTime + 5)),
        ArrowUp: () => (media.volume = Math.min(1, media.volume + 0.1)),
        ArrowDown: () => (media.volume = Math.max(0, media.volume - 0.1)),
        m: () => (media.muted = !media.muted),
        f: fullscreen,
        n: () => step(1),
        p: () => step(-1),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    });

    const offFs = os.bus.on('fs:changed', (change) => {
      if (change.dirs.some((d) => sourceDirs.includes(d))) buildPlaylist();
    });
    win.onClose(() => {
      offFs();
      media.pause();
      media.removeAttribute('src');
      media.load();
    });

    // ---- start -----------------------------------------------------------------

    updatePlayButton();
    updateVolume();
    if (args.path) {
      sourceDirs = [dirname(args.path)];
      buildPlaylist();
      load(args.path, true);
    } else {
      // Launched on its own: offer everything in Music and Videos.
      sourceDirs = [`${HOME}/Music`, `${HOME}/Videos`];
      buildPlaylist();
      root.classList.add('is-empty');
      message.textContent = playlist.length
        ? 'Pick something from the playlist, or press Space to play.'
        : 'Add audio and video to ~/Music or ~/Videos, then open them here.';
    }
    root.focus();
  },
};
