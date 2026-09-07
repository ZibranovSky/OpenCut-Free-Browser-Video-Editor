import type { TimelineClip, TimelineTrack, Transition, VideoProject } from '../../types/project';
import { isClipActive } from '../../utils/time';
import { ClipMediaPool } from './ClipMediaPool';

interface Presentation {
  opacity: number;
  offsetX: number;
}

export interface RenderOptions {
  shouldCommit?: () => boolean;
}

function getVisualTracks(project: VideoProject): TimelineTrack[] {
  return project.tracks.filter((track) => (track.type === 'video' || track.type === 'text') && !track.hidden);
}

function transitionPresentation(project: VideoProject, clip: TimelineClip, time: number): Presentation {
  const base: Presentation = { opacity: 'opacity' in clip ? clip.opacity : 1, offsetX: 0 };
  const transition = project.transitions.find((item) => item.fromClipId === clip.id || item.toClipId === clip.id);
  if (!transition) return base;
  const from = project.tracks.flatMap((track) => track.clips).find((item) => item.id === transition.fromClipId);
  const to = project.tracks.flatMap((track) => track.clips).find((item) => item.id === transition.toClipId);
  if (!from || !to) return base;
  const start = Math.max(from.timelineStart, to.timelineStart);
  const end = Math.min(from.timelineStart + from.timelineDuration, to.timelineStart + to.timelineDuration);
  const duration = Math.max(0.001, Math.min(transition.duration, end - start));
  if (time < start || time > start + duration) return base;
  const p = Math.max(0, Math.min(1, (time - start) / duration));
  const isFrom = clip.id === from.id;
  if (transition.type === 'crossfade' || transition.type === 'fade') {
    return { ...base, opacity: base.opacity * (isFrom ? 1 - p : p) };
  }
  if (transition.type === 'slide-left') {
    return { ...base, offsetX: isFrom ? -project.settings.width * p : project.settings.width * (1 - p) };
  }
  return { ...base, offsetX: isFrom ? project.settings.width * p : -project.settings.width * (1 - p) };
}

function applyVisualTransform(ctx: CanvasRenderingContext2D, clip: Extract<TimelineClip, { type: 'video' | 'image' | 'text' }>, offsetX: number): void {
  ctx.translate(clip.transform.x + offsetX, clip.transform.y);
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  ctx.scale(clip.transform.scaleX, clip.transform.scaleY);
}

function drawFittedMedia(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, projectWidth: number, projectHeight: number): void {
  const scale = Math.min(projectWidth / sourceWidth, projectHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
}

function drawText(ctx: CanvasRenderingContext2D, clip: Extract<TimelineClip, { type: 'text' }>): void {
  const style = clip.style;
  ctx.globalAlpha *= style.opacity;
  ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'middle';
  if (style.backgroundColor && style.backgroundColor !== 'transparent') {
    const metrics = ctx.measureText(clip.text);
    const padding = style.fontSize * 0.25;
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(-metrics.width / 2 - padding, -style.fontSize / 2 - padding, metrics.width + padding * 2, style.fontSize + padding * 2);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(clip.text, 0, 0);
}

function effectFilter(clip: Extract<TimelineClip, { type: 'video' }>): string {
  const e = clip.effects;
  return [
    `brightness(${100 + e.brightness}%)`,
    `contrast(${100 + e.contrast}%)`,
    `saturate(${100 + e.saturation}%)`,
    `grayscale(${Math.max(0, Math.min(100, e.grayscale))}%)`,
  ].join(' ');
}

export class FrameComposer {
  private backBuffer: HTMLCanvasElement | null = null;
  private lastVideoFrames = new Map<string, HTMLCanvasElement>();
  private hasCommittedFrame = false;

  constructor(private readonly pool: ClipMediaPool) {}

  private getBackBuffer(width: number, height: number): HTMLCanvasElement {
    if (!this.backBuffer) this.backBuffer = document.createElement('canvas');
    if (this.backBuffer.width !== width || this.backBuffer.height !== height) {
      this.backBuffer.width = width;
      this.backBuffer.height = height;
    }
    return this.backBuffer;
  }

  private cacheVideoFrame(clipId: string, video: HTMLVideoElement): HTMLCanvasElement | undefined {
    if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined;
    let frame = this.lastVideoFrames.get(clipId);
    if (!frame) {
      frame = document.createElement('canvas');
      this.lastVideoFrames.set(clipId, frame);
    }
    if (frame.width !== video.videoWidth || frame.height !== video.videoHeight) {
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
    }
    const ctx = frame.getContext('2d', { alpha: false });
    if (!ctx) return undefined;
    try {
      ctx.drawImage(video, 0, 0, frame.width, frame.height);
      return frame;
    } catch {
      return undefined;
    }
  }

  async render(project: VideoProject, timelineTime: number, canvas: HTMLCanvasElement, options: RenderOptions = {}): Promise<boolean> {
    if (canvas.width !== project.settings.width || canvas.height !== project.settings.height) {
      canvas.width = project.settings.width;
      canvas.height = project.settings.height;
      this.hasCommittedFrame = false;
    }

    const buffer = this.getBackBuffer(project.settings.width, project.settings.height);
    const ctx = buffer.getContext('2d', { alpha: false });
    if (!ctx) return false;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = project.settings.backgroundColor;
    ctx.fillRect(0, 0, buffer.width, buffer.height);
    ctx.restore();

    let missingUncachedVideoFrame = false;
    const tracks = getVisualTracks(project).reverse();
    for (const track of tracks) {
      const active = track.clips.filter((clip) => isClipActive(clip, timelineTime));
      for (const clip of active) {
        if (clip.type === 'audio') continue;
        ctx.save();
        const presentation = transitionPresentation(project, clip, timelineTime);
        ctx.globalAlpha = presentation.opacity;
        applyVisualTransform(ctx, clip, presentation.offsetX);
        if (clip.type === 'text') {
          drawText(ctx, clip);
          ctx.restore();
          continue;
        }
        const asset = project.media.find((item) => item.id === clip.mediaId);
        if (!asset) {
          ctx.restore();
          continue;
        }
        if (clip.type === 'image') {
          const image = await this.pool.getImage(asset);
          if (image?.naturalWidth && image.naturalHeight) {
            drawFittedMedia(ctx, image, image.naturalWidth, image.naturalHeight, project.settings.width, project.settings.height);
          }
        } else {
          const video = await this.pool.getElement(clip, asset);
          let source: CanvasImageSource | undefined;
          let width = 0;
          let height = 0;
          if (video instanceof HTMLVideoElement && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
            const freshFrame = this.cacheVideoFrame(clip.id, video);
            if (freshFrame) {
              source = freshFrame;
              width = freshFrame.width;
              height = freshFrame.height;
            }
          }
          if (!source) {
            const cached = this.lastVideoFrames.get(clip.id);
            if (cached?.width && cached.height) {
              source = cached;
              width = cached.width;
              height = cached.height;
            } else {
              missingUncachedVideoFrame = true;
            }
          }
          if (source && width && height) {
            ctx.filter = effectFilter(clip);
            drawFittedMedia(ctx, source, width, height, project.settings.width, project.settings.height);
          }
        }
        ctx.restore();
      }
    }

    if (missingUncachedVideoFrame && this.hasCommittedFrame) return false;
    if (options.shouldCommit && !options.shouldCommit()) return false;

    const target = canvas.getContext('2d', { alpha: false });
    if (!target) return false;
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.filter = 'none';
    target.drawImage(buffer, 0, 0);
    target.restore();
    this.hasCommittedFrame = true;
    return true;
  }
}

export function transitionForClip(transitions: Transition[], clipId: string): Transition | undefined {
  return transitions.find((transition) => transition.fromClipId === clipId || transition.toClipId === clipId);
}
