import type { TimelineClip, TimelineTrack } from '../types/project';

export const EPSILON = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function timeToPixels(seconds: number, pixelsPerSecond: number): number {
  return seconds * pixelsPerSecond;
}

export function pixelsToTime(pixels: number, pixelsPerSecond: number): number {
  return pixels / pixelsPerSecond;
}

export function timeToFrame(seconds: number, frameRate: number): number {
  return Math.round(seconds * frameRate);
}

export function frameToTime(frame: number, frameRate: number): number {
  return frame / frameRate;
}

export function approximatelyEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.floor((safe % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export function getProjectDuration(tracks: TimelineTrack[]): number {
  return tracks.reduce((maxTrack, track) => {
    const maxClip = track.clips.reduce(
      (max, clip) => Math.max(max, clip.timelineStart + clip.timelineDuration),
      0,
    );
    return Math.max(maxTrack, maxClip);
  }, 0);
}

export function isClipActive(clip: TimelineClip, time: number): boolean {
  return time + EPSILON >= clip.timelineStart && time < clip.timelineStart + clip.timelineDuration - EPSILON;
}

export function sourceTimeForClip(
  clip: Extract<TimelineClip, { type: 'video' | 'audio' }>,
  timelineTime: number,
): number {
  const local = timelineTime - clip.timelineStart;
  return clip.sourceStart + local * clip.playbackRate;
}

export function snapTime(
  value: number,
  candidates: number[],
  thresholdSeconds: number,
): { value: number; snapped: boolean } {
  let best = value;
  let bestDistance = thresholdSeconds + EPSILON;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= thresholdSeconds && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { value: best, snapped: !approximatelyEqual(best, value) };
}

export function collectSnapCandidates(
  tracks: TimelineTrack[],
  playhead: number,
  excludeClipId?: string,
): number[] {
  const values = [0, playhead];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      values.push(clip.timelineStart, clip.timelineStart + clip.timelineDuration);
    }
  }
  return values;
}
