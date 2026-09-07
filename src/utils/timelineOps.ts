import type { TimelineClip, TimelineTrack } from '../types/project';
import { clamp } from './time';
import { id } from './ids';

function replaceClip(tracks: TimelineTrack[], nextClip: TimelineClip): TimelineTrack[] {
  return tracks.map((track) =>
    track.id === nextClip.trackId
      ? { ...track, clips: track.clips.map((clip) => (clip.id === nextClip.id ? nextClip : clip)) }
      : track,
  );
}

export function moveClip(
  tracks: TimelineTrack[],
  clipId: string,
  newTimelineStart: number,
  newTrackId?: string,
): TimelineTrack[] {
  let found: TimelineClip | undefined;
  for (const track of tracks) {
    found = track.clips.find((clip) => clip.id === clipId);
    if (found) break;
  }
  if (!found) return tracks;
  const destinationId = newTrackId ?? found.trackId;
  const destination = tracks.find((track) => track.id === destinationId);
  if (!destination || destination.locked) return tracks;
  const compatible =
    (destination.type === 'video' && ['video', 'image'].includes(found.type)) ||
    (destination.type === 'audio' && found.type === 'audio') ||
    (destination.type === 'text' && found.type === 'text');
  if (!compatible) return tracks;

  const next = { ...found, trackId: destinationId, timelineStart: Math.max(0, newTimelineStart) } as TimelineClip;
  return tracks.map((track) => ({
    ...track,
    clips:
      track.id === destinationId
        ? [...track.clips.filter((clip) => clip.id !== clipId), next].sort((a, b) => a.timelineStart - b.timelineStart)
        : track.clips.filter((clip) => clip.id !== clipId),
  }));
}

export function trimLeft(
  tracks: TimelineTrack[],
  clipId: string,
  delta: number,
  frameRate: number,
): TimelineTrack[] {
  const minDuration = 1 / frameRate;
  const clip = tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
  if (!clip) return tracks;
  const maxDelta = clip.timelineDuration - minDuration;
  const applied = clamp(delta, -clip.timelineStart, maxDelta);

  if (clip.type === 'video' || clip.type === 'audio') {
    const maxBack = clip.sourceStart / clip.playbackRate;
    const bounded = Math.max(applied, -maxBack);
    const next = {
      ...clip,
      timelineStart: clip.timelineStart + bounded,
      timelineDuration: clip.timelineDuration - bounded,
      sourceStart: clip.sourceStart + bounded * clip.playbackRate,
      sourceDuration: clip.sourceDuration - bounded * clip.playbackRate,
    } as TimelineClip;
    return replaceClip(tracks, next);
  }

  const next = {
    ...clip,
    timelineStart: clip.timelineStart + applied,
    timelineDuration: clip.timelineDuration - applied,
  } as TimelineClip;
  return replaceClip(tracks, next);
}

export function trimRight(
  tracks: TimelineTrack[],
  clipId: string,
  delta: number,
  frameRate: number,
  sourceMediaDuration?: number,
): TimelineTrack[] {
  const minDuration = 1 / frameRate;
  const clip = tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
  if (!clip) return tracks;
  let maxDuration = Number.POSITIVE_INFINITY;
  if ((clip.type === 'video' || clip.type === 'audio') && sourceMediaDuration != null) {
    maxDuration = (sourceMediaDuration - clip.sourceStart) / clip.playbackRate;
  }
  const nextDuration = clamp(clip.timelineDuration + delta, minDuration, maxDuration);
  if (clip.type === 'video' || clip.type === 'audio') {
    const next = {
      ...clip,
      timelineDuration: nextDuration,
      sourceDuration: nextDuration * clip.playbackRate,
    } as TimelineClip;
    return replaceClip(tracks, next);
  }
  return replaceClip(tracks, { ...clip, timelineDuration: nextDuration } as TimelineClip);
}

export function splitClip(
  tracks: TimelineTrack[],
  clipId: string,
  playhead: number,
  frameRate: number,
): { tracks: TimelineTrack[]; rightClipId?: string } {
  const minDuration = 1 / frameRate;
  const clip = tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
  if (!clip) return { tracks };
  const offset = playhead - clip.timelineStart;
  if (offset < minDuration || clip.timelineDuration - offset < minDuration) return { tracks };

  const rightId = id('clip');
  let left: TimelineClip;
  let right: TimelineClip;
  if (clip.type === 'video' || clip.type === 'audio') {
    left = {
      ...clip,
      timelineDuration: offset,
      sourceDuration: offset * clip.playbackRate,
    } as TimelineClip;
    right = {
      ...clip,
      id: rightId,
      timelineStart: playhead,
      timelineDuration: clip.timelineDuration - offset,
      sourceStart: clip.sourceStart + offset * clip.playbackRate,
      sourceDuration: (clip.timelineDuration - offset) * clip.playbackRate,
    } as TimelineClip;
  } else {
    left = { ...clip, timelineDuration: offset } as TimelineClip;
    right = {
      ...clip,
      id: rightId,
      timelineStart: playhead,
      timelineDuration: clip.timelineDuration - offset,
    } as TimelineClip;
  }

  return {
    tracks: tracks.map((track) =>
      track.id === clip.trackId
        ? {
            ...track,
            clips: [...track.clips.filter((item) => item.id !== clipId), left, right].sort(
              (a, b) => a.timelineStart - b.timelineStart,
            ),
          }
        : track,
    ),
    rightClipId: rightId,
  };
}

export function deleteClip(tracks: TimelineTrack[], clipId: string): TimelineTrack[] {
  return tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }));
}

export function duplicateClip(tracks: TimelineTrack[], clipId: string): { tracks: TimelineTrack[]; newId?: string } {
  const clip = tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
  if (!clip) return { tracks };
  const newId = id('clip');
  const next = {
    ...clip,
    id: newId,
    timelineStart: clip.timelineStart + clip.timelineDuration,
  } as TimelineClip;
  return {
    tracks: tracks.map((track) =>
      track.id === clip.trackId
        ? { ...track, clips: [...track.clips, next].sort((a, b) => a.timelineStart - b.timelineStart) }
        : track,
    ),
    newId,
  };
}
