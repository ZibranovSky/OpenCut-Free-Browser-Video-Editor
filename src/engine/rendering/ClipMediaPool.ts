import type { MediaAsset, TimelineClip, VideoProject } from '../../types/project';
import { mediaRegistry } from '../mediaRegistry';
import { isClipActive, sourceTimeForClip } from '../../utils/time';

export type PooledElement = HTMLVideoElement | HTMLAudioElement;

function isSourceClip(clip: TimelineClip): clip is Extract<TimelineClip, { type: 'video' | 'audio' }> {
  return clip.type === 'video' || clip.type === 'audio';
}

export class ClipMediaPool {
  private elements = new Map<string, PooledElement>();
  private images = new Map<string, HTMLImageElement>();

  async getElement(clip: Extract<TimelineClip, { type: 'video' | 'audio' }>, asset: MediaAsset): Promise<PooledElement | undefined> {
    const existing = this.elements.get(clip.id);
    if (existing) return existing;
    const url = await mediaRegistry.ensure(asset);
    if (!url) return undefined;
    const element = document.createElement(clip.type === 'video' ? 'video' : 'audio');
    element.preload = 'auto';
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    element.crossOrigin = 'anonymous';
    element.src = url;
    this.elements.set(clip.id, element);
    return element;
  }

  async getImage(asset: MediaAsset): Promise<HTMLImageElement | undefined> {
    const existing = this.images.get(asset.id);
    if (existing) return existing;
    const url = await mediaRegistry.ensure(asset);
    if (!url) return undefined;
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => undefined);
    this.images.set(asset.id, image);
    return image;
  }

  getExistingElement(clipId: string): PooledElement | undefined {
    return this.elements.get(clipId);
  }

  async prepareProject(project: VideoProject): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (isSourceClip(clip)) {
          const asset = project.media.find((item) => item.id === clip.mediaId);
          if (asset) {
            jobs.push((async () => {
              const element = await this.getElement(clip, asset);
              if (!element || element.readyState >= 2) return;
              await new Promise<void>((resolve) => {
                const done = () => { clearTimeout(timeout); element.removeEventListener('loadeddata', done); resolve(); };
                const timeout = window.setTimeout(done, 2500);
                element.addEventListener('loadeddata', done, { once: true });
                element.load();
              });
            })());
          }
        } else if (clip.type === 'image') {
          const asset = project.media.find((item) => item.id === clip.mediaId);
          if (asset) jobs.push(this.getImage(asset));
        }
      }
    }
    await Promise.allSettled(jobs);
  }

  async seek(project: VideoProject, timelineTime: number): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (!isSourceClip(clip) || !isClipActive(clip, timelineTime)) continue;
        const asset = project.media.find((item) => item.id === clip.mediaId);
        if (!asset) continue;
        const element = await this.getElement(clip, asset);
        if (!element) continue;
        element.pause();
        const expected = Math.max(0, sourceTimeForClip(clip, timelineTime));
        const target = Number.isFinite(element.duration) ? Math.min(expected, Math.max(0, element.duration - 0.001)) : expected;
        if (Math.abs(element.currentTime - target) <= 1 / Math.max(24, project.settings.frameRate)) continue;
        try {
          element.currentTime = target;
          if (element instanceof HTMLVideoElement) {
            waits.push(new Promise<void>((resolve) => {
              const done = () => { clearTimeout(timeout); element.removeEventListener('seeked', done); resolve(); };
              const timeout = window.setTimeout(done, 300);
              element.addEventListener('seeked', done, { once: true });
            }));
          }
        } catch { /* metadata may still be loading */ }
      }
    }
    await Promise.all(waits);
  }

  async sync(project: VideoProject, timelineTime: number, playing: boolean): Promise<void> {
    const activeIds = new Set<string>();
    const promises: Promise<void>[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (!isSourceClip(clip)) continue;
        const asset = project.media.find((item) => item.id === clip.mediaId);
        if (!asset) continue;
        const element = await this.getElement(clip, asset);
        if (!element) continue;
        const active = isClipActive(clip, timelineTime);
        const trackAudible = !track.muted;
        if (!active) {
          if (!element.paused) element.pause();
          continue;
        }
        activeIds.add(clip.id);
        const expected = Math.max(0, sourceTimeForClip(clip, timelineTime));
        const local = timelineTime - clip.timelineStart;
        const remaining = clip.timelineDuration - local;
        let fade = 1;
        if (clip.fadeIn > 0) fade *= Math.min(1, Math.max(0, local / clip.fadeIn));
        if (clip.fadeOut > 0) fade *= Math.min(1, Math.max(0, remaining / clip.fadeOut));
        const volume = clip.muted || !trackAudible ? 0 : Math.max(0, Math.min(1, clip.volume * fade));
        element.volume = volume;
        element.playbackRate = Math.max(0.25, Math.min(4, clip.playbackRate));
        const tolerance = playing ? 0.3 : 1 / Math.max(24, project.settings.frameRate);
        if (!element.seeking && Number.isFinite(element.duration) && Math.abs(element.currentTime - expected) > tolerance) {
          try { element.currentTime = Math.min(expected, Math.max(0, element.duration - 0.001)); } catch { /* metadata may still be loading */ }
        }
        if (playing && element.paused) {
          promises.push(element.play().catch(() => undefined));
        } else if (!playing && !element.paused) {
          element.pause();
        }
      }
    }
    for (const [clipId, element] of this.elements) {
      if (!activeIds.has(clipId) && !element.paused) element.pause();
    }
    await Promise.all(promises);
  }

  pauseAll(): void {
    for (const element of this.elements.values()) element.pause();
  }

  destroy(): void {
    for (const element of this.elements.values()) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    this.elements.clear();
    this.images.clear();
  }
}
