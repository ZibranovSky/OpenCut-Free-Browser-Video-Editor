import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_CORE_VERSION = '0.12.10';
const FFMPEG_CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

export interface TranscodeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export async function transcodeWebMToMp4(input: Blob, options: TranscodeOptions = {}): Promise<Blob> {
  if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const ffmpeg = new FFmpeg();
  let aborted = false;
  const abort = () => {
    aborted = true;
    try { ffmpeg.terminate(); } catch { /* already terminated */ }
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  ffmpeg.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) options.onProgress?.(Math.max(0, Math.min(1, progress)));
  });

  try {
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);
    if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    await ffmpeg.load({ coreURL, wasmURL });
    if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    await ffmpeg.writeFile('opencut-input.webm', await fetchFile(input));
    const exitCode = await ffmpeg.exec([
      '-i', 'opencut-input.webm',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      'opencut-output.mp4',
    ]);
    if (aborted || options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    if (exitCode !== 0) throw new Error(`FFmpeg MP4 conversion failed with exit code ${exitCode}.`);

    const data = await ffmpeg.readFile('opencut-output.mp4');
    if (!(data instanceof Uint8Array)) throw new Error('FFmpeg returned an invalid MP4 output.');
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } catch (error) {
    if (aborted || options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    try { await ffmpeg.deleteFile('opencut-input.webm'); } catch { /* no-op */ }
    try { await ffmpeg.deleteFile('opencut-output.mp4'); } catch { /* no-op */ }
    try { ffmpeg.terminate(); } catch { /* no-op */ }
  }
}
