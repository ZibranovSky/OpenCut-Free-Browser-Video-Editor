import type { TimelineClip, VideoProject } from '../../types/project';
import { getProjectDuration, isClipActive, sourceTimeForClip } from '../../utils/time';
import { ClipMediaPool, type PooledElement } from '../rendering/ClipMediaPool';
import { FrameComposer } from '../rendering/FrameComposer';

export type ExportFormat = 'mp4' | 'webm';

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'transcoding' | 'finalizing';
  progress: number;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  extension: ExportFormat;
}

export interface ExportOptions {
  frameRate: number;
  format: ExportFormat;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportFormatInfo {
  id: ExportFormat;
  label: string;
  available: boolean;
  native: boolean;
  detail: string;
}

interface RecorderFormat {
  mimeType: string;
  extension: ExportFormat;
}

interface AudioRoute {
  element: PooledElement;
  gain: GainNode;
  clip: Extract<TimelineClip, { type: 'video' | 'audio' }>;
  trackMuted: boolean;
}

const MP4_CANDIDATES: RecorderFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1.4D401E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
];

const WEBM_CANDIDATES: RecorderFormat[] = [
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

function firstSupported(candidates: RecorderFormat[]): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null;
}

function chooseRecordingFormat(requested: ExportFormat): { recorder: RecorderFormat; needsMp4Transcode: boolean } {
  if (requested === 'mp4') {
    const nativeMp4 = firstSupported(MP4_CANDIDATES);
    if (nativeMp4) return { recorder: nativeMp4, needsMp4Transcode: false };
    const webm = firstSupported(WEBM_CANDIDATES);
    if (webm) return { recorder: webm, needsMp4Transcode: true };
    throw new Error('This browser cannot create a recording that can be exported to MP4.');
  }

  const webm = firstSupported(WEBM_CANDIDATES);
  if (!webm) throw new Error('This browser does not support WebM MediaRecorder export.');
  return { recorder: webm, needsMp4Transcode: false };
}

function fadeGain(clip: Extract<TimelineClip, { type: 'video' | 'audio' }>, time: number): number {
  const local = time - clip.timelineStart;
  const remaining = clip.timelineDuration - local;
  let gain = 1;
  if (clip.fadeIn > 0) gain *= Math.min(1, Math.max(0, local / clip.fadeIn));
  if (clip.fadeOut > 0) gain *= Math.min(1, Math.max(0, remaining / clip.fadeOut));
  return gain;
}

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'opencut-export';
}

export class ExportEngine {
  static getFormats(): ExportFormatInfo[] {
    const nativeMp4 = firstSupported(MP4_CANDIDATES);
    const webm = firstSupported(WEBM_CANDIDATES);
    return [
      {
        id: 'mp4',
        label: 'MP4 (H.264)',
        available: Boolean(nativeMp4 || webm),
        native: Boolean(nativeMp4),
        detail: nativeMp4
          ? `Native browser export · ${nativeMp4.mimeType}`
          : webm
            ? 'FFmpeg/WASM fallback · converts the rendered WebM to MP4 locally'
            : 'Unavailable in this browser',
      },
      {
        id: 'webm',
        label: 'WebM',
        available: Boolean(webm),
        native: Boolean(webm),
        detail: webm?.mimeType ?? 'Unavailable in this browser',
      },
    ];
  }

  static fileName(projectName: string, extension: string): string {
    return `${sanitizeName(projectName)}.${extension}`;
  }

  async render(project: VideoProject, options: ExportOptions): Promise<ExportResult> {
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available in this browser.');
    if (!HTMLCanvasElement.prototype.captureStream) throw new Error('Canvas capture is not available in this browser.');
    const duration = getProjectDuration(project.tracks);
    if (duration <= 0) throw new Error('Add at least one clip before exporting.');

    options.onProgress?.({ phase: 'preparing', progress: 0 });
    const { recorder: recordingFormat, needsMp4Transcode } = chooseRecordingFormat(options.format);

    const audioContext = new AudioContext();
    await audioContext.resume();
    const pool = new ClipMediaPool();
    await pool.prepareProject(project);
    const composer = new FrameComposer(pool);
    const canvas = document.createElement('canvas');
    canvas.width = project.settings.width;
    canvas.height = project.settings.height;
    await pool.seek(project, 0);
    await composer.render(project, 0, canvas);

    const destination = audioContext.createMediaStreamDestination();
    const routes: AudioRoute[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'video' && clip.type !== 'audio') continue;
        const asset = project.media.find((item) => item.id === clip.mediaId);
        if (!asset) continue;
        const element = await pool.getElement(clip, asset);
        if (!element) continue;
        try {
          const source = audioContext.createMediaElementSource(element);
          const gain = audioContext.createGain();
          gain.gain.value = 0;
          source.connect(gain).connect(destination);
          element.volume = 1;
          element.muted = false;
          routes.push({ element, gain, clip, trackMuted: track.muted });
        } catch {
          // A browser can reject routing media without a decodable audio stream.
        }
      }
    }

    const videoStream = canvas.captureStream(options.frameRate);
    for (const audioTrack of destination.stream.getAudioTracks()) videoStream.addTrack(audioTrack);
    const recorder = new MediaRecorder(videoStream, {
      mimeType: recordingFormat.mimeType,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const stopPromise = new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.addEventListener('error', () => reject(new Error('The browser media recorder failed during export.')), { once: true });
    });

    const syncRoutes = async (time: number): Promise<void> => {
      const plays: Promise<void>[] = [];
      for (const route of routes) {
        const { clip, element, gain, trackMuted } = route;
        if (!isClipActive(clip, time)) {
          gain.gain.value = 0;
          if (!element.paused) element.pause();
          continue;
        }
        const expected = sourceTimeForClip(clip, time);
        element.playbackRate = Math.max(0.25, Math.min(4, clip.playbackRate));
        if (!element.seeking && Math.abs(element.currentTime - expected) > 0.3) {
          try { element.currentTime = expected; } catch { /* ignored while metadata settles */ }
        }
        const volume = clip.muted || trackMuted ? 0 : Math.max(0, Math.min(2, clip.volume));
        gain.gain.value = volume * fadeGain(clip, time);
        if (element.paused) plays.push(element.play().catch(() => undefined));
      }
      await Promise.all(plays);
    };

    recorder.start(1000);
    const started = performance.now();
    let lastMediaSync = -Infinity;
    let renderError: unknown = null;
    try {
      await new Promise<void>((resolve, reject) => {
        const frame = async (now: number) => {
          if (options.signal?.aborted) {
            reject(new DOMException('Export cancelled', 'AbortError'));
            return;
          }
          const time = Math.min(duration, (now - started) / 1000);
          if (time - lastMediaSync > 0.2 || time === 0) {
            lastMediaSync = time;
            await syncRoutes(time);
          }
          await composer.render(project, time, canvas);
          const renderShare = needsMp4Transcode ? 0.82 : 0.98;
          options.onProgress?.({ phase: 'rendering', progress: Math.min(renderShare, (time / duration) * renderShare) });
          if (time >= duration) {
            resolve();
            return;
          }
          requestAnimationFrame((next) => { void frame(next); });
        };
        requestAnimationFrame((next) => { void frame(next); });
      });
    } catch (error) {
      renderError = error;
    } finally {
      pool.pauseAll();
      for (const route of routes) route.gain.gain.value = 0;
      if (recorder.state !== 'inactive') recorder.stop();
    }

    try {
      await stopPromise;
    } finally {
      for (const track of videoStream.getTracks()) track.stop();
      await audioContext.close();
      pool.destroy();
    }
    if (renderError) throw renderError;

    const recordedBlob = new Blob(chunks, { type: recordingFormat.mimeType });
    if (!needsMp4Transcode) {
      options.onProgress?.({ phase: 'finalizing', progress: 1 });
      return { blob: recordedBlob, mimeType: recordingFormat.mimeType, extension: options.format };
    }

    options.onProgress?.({ phase: 'transcoding', progress: 0.83 });
    try {
      const { transcodeWebMToMp4 } = await import('./transcodeMp4');
      const mp4 = await transcodeWebMToMp4(recordedBlob, {
        signal: options.signal,
        onProgress: (value) => options.onProgress?.({ phase: 'transcoding', progress: 0.83 + value * 0.16 }),
      });
      options.onProgress?.({ phase: 'finalizing', progress: 1 });
      return { blob: mp4, mimeType: 'video/mp4', extension: 'mp4' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error(`MP4 conversion failed. ${error instanceof Error ? error.message : 'Unknown FFmpeg error.'}`);
    }
  }
}
