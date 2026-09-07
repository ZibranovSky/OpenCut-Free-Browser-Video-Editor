import { describe, expect, it } from 'vitest';
import type { TimelineTrack, VideoClip } from '../../src/types/project';
import { deleteClip, duplicateClip, moveClip, splitClip, trimLeft, trimRight } from '../../src/utils/timelineOps';
import { frameToTime, getProjectDuration, pixelsToTime, snapTime, sourceTimeForClip, timeToFrame, timeToPixels } from '../../src/utils/time';

const clip = (overrides: Partial<VideoClip> = {}): VideoClip => ({
  id: 'clip-a', trackId: 'v1', type: 'video', mediaId: 'm1', timelineStart: 5, timelineDuration: 8,
  sourceStart: 10, sourceDuration: 8, playbackRate: 1,
  transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, rotation: 0, anchorX: .5, anchorY: .5 },
  opacity: 1, volume: 1, muted: false,
  effects: { brightness: 0, contrast: 0, saturation: 0, grayscale: 0 }, fadeIn: 0, fadeOut: 0,
  ...overrides,
});
const tracks = (c = clip()): TimelineTrack[] => [{ id: 'v1', name: 'Video 1', type: 'video', clips: [c], locked: false, muted: false, hidden: false, height: 72 }];

describe('time conversion', () => {
  it('maps time and pixels bidirectionally', () => { expect(timeToPixels(2.5, 80)).toBe(200); expect(pixelsToTime(200, 80)).toBe(2.5); });
  it('maps frames and time', () => { expect(timeToFrame(1.5, 30)).toBe(45); expect(frameToTime(45, 30)).toBe(1.5); });
});

describe('timeline editing', () => {
  it('left trims source and timeline together', () => {
    const result = trimLeft(tracks(), 'clip-a', 2, 30)[0].clips[0] as VideoClip;
    expect(result.timelineStart).toBe(7); expect(result.sourceStart).toBe(12); expect(result.timelineDuration).toBe(6);
  });
  it('right trim does not move clip start', () => {
    const result = trimRight(tracks(), 'clip-a', -2, 30, 30)[0].clips[0] as VideoClip;
    expect(result.timelineStart).toBe(5); expect(result.sourceStart).toBe(10); expect(result.timelineDuration).toBe(6);
  });
  it('splits without source discontinuity', () => {
    const original = clip({ timelineStart: 10, sourceStart: 4, timelineDuration: 10, sourceDuration: 10 });
    const result = splitClip(tracks(original), 'clip-a', 16, 30).tracks[0].clips as VideoClip[];
    const left = result.find((x) => x.id === 'clip-a')!; const right = result.find((x) => x.id !== 'clip-a')!;
    expect(left.timelineDuration).toBe(6); expect(left.sourceStart).toBe(4);
    expect(right.timelineStart).toBe(16); expect(right.sourceStart).toBe(10); expect(right.timelineDuration).toBe(4);
  });
  it('maps source time with playback rate', () => {
    expect(sourceTimeForClip(clip({ sourceStart: 10, timelineStart: 5, playbackRate: 2 }), 7)).toBe(14);
  });
  it('moves, duplicates, deletes, and calculates duration', () => {
    const moved = moveClip(tracks(), 'clip-a', 12);
    expect((moved[0].clips[0] as VideoClip).timelineStart).toBe(12);
    const dup = duplicateClip(moved, 'clip-a'); expect(dup.tracks[0].clips).toHaveLength(2);
    expect(getProjectDuration(dup.tracks)).toBe(28);
    expect(deleteClip(dup.tracks, 'clip-a')[0].clips).toHaveLength(1);
  });
  it('snaps within the screen-derived threshold', () => {
    expect(snapTime(9.94, [0, 10], .1)).toEqual({ value: 10, snapped: true });
    expect(snapTime(9.7, [10], .1)).toEqual({ value: 9.7, snapped: false });
  });
});
