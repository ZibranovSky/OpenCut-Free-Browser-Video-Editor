import type { MediaAsset, MediaType } from '../../types/project';
import { id } from '../../utils/ids';
import { mediaRegistry } from '../../engine/mediaRegistry';
import { saveMediaBlob } from '../../database/projectRepository';

function inferType(file: File): MediaType | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext ?? '')) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext ?? '')) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext ?? '')) return 'image';
  return null;
}

function waitForEvent(target: EventTarget, okEvent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The browser could not decode this media file.'));
    };
    const cleanup = () => {
      target.removeEventListener(okEvent, onOk);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(okEvent, onOk, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

async function createVideoThumbnail(video: HTMLVideoElement, duration: number): Promise<string | undefined> {
  try {
    video.currentTime = Math.min(Math.max(duration * 0.08, 0.05), Math.max(0.05, duration - 0.05));
    await waitForEvent(video, 'seeked');
    const canvas = document.createElement('canvas');
    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

export async function importMediaFile(projectId: string, file: File): Promise<MediaAsset> {
  const type = inferType(file);
  if (!type) throw new Error(`Unsupported file: ${file.name}`);
  const mediaId = id('media');
  const url = mediaRegistry.register(mediaId, file);
  let duration: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let thumbnailUrl: string | undefined;

  if (type === 'video') {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    await waitForEvent(video, 'loadedmetadata');
    duration = Number.isFinite(video.duration) ? video.duration : undefined;
    width = video.videoWidth || undefined;
    height = video.videoHeight || undefined;
    if (duration && width && height) thumbnailUrl = await createVideoThumbnail(video, duration);
    video.removeAttribute('src');
    video.load();
  } else if (type === 'audio') {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;
    await waitForEvent(audio, 'loadedmetadata');
    duration = Number.isFinite(audio.duration) ? audio.duration : undefined;
    audio.removeAttribute('src');
    audio.load();
  } else {
    const image = new Image();
    image.src = url;
    await waitForEvent(image, 'load');
    width = image.naturalWidth;
    height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 320 / Math.max(1, width));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    thumbnailUrl = canvas.toDataURL('image/jpeg', 0.78);
  }

  const asset: MediaAsset = {
    id: mediaId,
    name: file.name,
    type,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    duration,
    width,
    height,
    hasAudio: undefined,
    thumbnailUrl,
    createdAt: Date.now(),
  };
  await saveMediaBlob(projectId, mediaId, file);
  return asset;
}
