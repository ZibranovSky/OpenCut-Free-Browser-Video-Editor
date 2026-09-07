import {
  Copy,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Plus,
  Scissors,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMemo, useRef, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip, TimelineTrack } from '../../types/project';
import { formatTimecode, getProjectDuration, pixelsToTime, timeToPixels } from '../../utils/time';

const HEADER_WIDTH = 124;

function clipLabel(clip: TimelineClip): string {
  return clip.type === 'text' ? clip.text : clip.type;
}


function TimelineClipView({ clip, mediaName }: { clip: TimelineClip; mediaName?: string }) {
  const selected = useEditorStore((s) => s.selectedClipId === clip.id);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const setSelectedClip = useEditorStore((s) => s.setSelectedClip);
  const moveSelected = useEditorStore((s) => s.moveSelected);
  const trimLeft = useEditorStore((s) => s.trimSelectedLeft);
  const trimRight = useEditorStore((s) => s.trimSelectedRight);
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const endTransaction = useEditorStore((s) => s.endTransaction);
  const drag = useRef<{ startX: number; origin: number } | null>(null);
  const trim = useRef<{ side: 'left' | 'right'; lastX: number } | null>(null);

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      const delta = pixelsToTime(event.clientX - drag.current.startX, pps);
      moveSelected(drag.current.origin + delta, undefined, false);
      return;
    }
    if (trim.current) {
      const delta = pixelsToTime(event.clientX - trim.current.lastX, pps);
      trim.current.lastX = event.clientX;
      if (trim.current.side === 'left') trimLeft(delta, false);
      else trimRight(delta, false);
    }
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current && !trim.current) return;
    drag.current = null;
    trim.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    endTransaction();
  };

  const className = `timeline-clip clip-${clip.type}${selected ? ' selected' : ''}`;
  return (
    <div
      className={className}
      style={{ left: timeToPixels(clip.timelineStart, pps), width: Math.max(8, timeToPixels(clip.timelineDuration, pps)) }}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).dataset.trim) return;
        event.stopPropagation();
        setSelectedClip(clip.id);
        beginTransaction();
        drag.current = { startX: event.clientX, origin: clip.timelineStart };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      title={`${mediaName ?? clipLabel(clip)} — ${formatTimecode(clip.timelineDuration)}`}
    >
      <div
        className="trim-handle trim-left"
        data-trim="left"
        onPointerDown={(event) => {
          event.stopPropagation();
          setSelectedClip(clip.id);
          beginTransaction();
          trim.current = { side: 'left', lastX: event.clientX };
          event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
        }}
      />
      <span className="clip-label">{clip.type === 'text' ? clip.text : mediaName ?? clip.type}</span>
      <div
        className="trim-handle trim-right"
        data-trim="right"
        onPointerDown={(event) => {
          event.stopPropagation();
          setSelectedClip(clip.id);
          beginTransaction();
          trim.current = { side: 'right', lastX: event.clientX };
          event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
        }}
      />
    </div>
  );
}

function TrackHeader({ track }: { track: TimelineTrack }) {
  const toggleLock = useEditorStore((s) => s.toggleTrackLock);
  const toggleMute = useEditorStore((s) => s.toggleTrackMute);
  const toggleVisibility = useEditorStore((s) => s.toggleTrackVisibility);
  return (
    <div className="track-header" style={{ height: track.height }}>
      <span className="track-name">{track.name}</span>
      <div className="track-actions">
        <button className="tiny-button" title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => toggleLock(track.id)}>
          {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        {track.type === 'audio' ? (
          <button className="tiny-button" title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => toggleMute(track.id)}>
            {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        ) : (
          <button className="tiny-button" title={track.hidden ? 'Show track' : 'Hide track'} onClick={() => toggleVisibility(track.id)}>
            {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Ruler({ width }: { width: number }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const duration = width / pps;
  const step = pps >= 240 ? 0.5 : pps >= 90 ? 1 : pps >= 40 ? 2 : 5;
  const marks = useMemo(() => {
    const list: number[] = [];
    for (let t = 0; t <= duration; t += step) list.push(t);
    return list;
  }, [duration, step]);

  return (
    <div
      className="timeline-ruler"
      style={{ width }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setCurrentTime(pixelsToTime(event.clientX - rect.left, pps));
      }}
    >
      {marks.map((time) => (
        <div className="ruler-mark" key={time} style={{ left: timeToPixels(time, pps) }}>
          <span>{time < 60 ? `${time.toFixed(step < 1 ? 1 : 0)}s` : formatTimecode(time).slice(3, 8)}</span>
        </div>
      ))}
    </div>
  );
}

export function Timeline() {
  const project = useEditorStore((s) => s.project);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const currentTime = useEditorStore((s) => s.currentTime);
  const snapping = useEditorStore((s) => s.snapping);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPps = useEditorStore((s) => s.setPixelsPerSecond);
  const toggleSnapping = useEditorStore((s) => s.toggleSnapping);
  const split = useEditorStore((s) => s.splitSelected);
  const duplicate = useEditorStore((s) => s.duplicateSelected);
  const remove = useEditorStore((s) => s.deleteSelected);
  const addTrack = useEditorStore((s) => s.addTrack);
  const addMediaClip = useEditorStore((s) => s.addMediaClip);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!project) return null;

  const duration = Math.max(30, getProjectDuration(project.tracks) + 5);
  const contentWidth = Math.max(1000, timeToPixels(duration, pps));

  const dropMedia = (event: ReactDragEvent<HTMLDivElement>, track: TimelineTrack) => {
    event.preventDefault();
    if (track.locked) return;
    const mediaId = event.dataTransfer.getData('application/x-opencut-media');
    const asset = project.media.find((item) => item.id === mediaId);
    if (!asset) return;
    const compatible = (track.type === 'video' && (asset.type === 'video' || asset.type === 'image')) || (track.type === 'audio' && asset.type === 'audio');
    if (!compatible) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = pixelsToTime(event.clientX - rect.left, pps);
    addMediaClip(asset, time, track.id);
  };

  return (
    <section className="timeline-panel" aria-label="Timeline">
      <div className="timeline-toolbar">
        <button className="toolbar-button" onClick={split} title="Split at playhead (S)"><Scissors size={15} /> Split</button>
        <button className="toolbar-button" onClick={duplicate} title="Duplicate (Ctrl/Cmd+D)"><Copy size={15} /> Duplicate</button>
        <button className="toolbar-button danger-hover" onClick={remove} title="Delete selected clip"><Trash2 size={15} /> Delete</button>
        <div className="toolbar-spacer" />
        <button className={`toolbar-button ${snapping ? 'active' : ''}`} onClick={toggleSnapping} title="Toggle snapping (N)"><Magnet size={15} /> Snap</button>
        <button className="icon-button" onClick={() => setPps(pps / 1.2)} title="Zoom out"><ZoomOut size={15} /></button>
        <span className="zoom-label">{Math.round(pps)} px/s</span>
        <button className="icon-button" onClick={() => setPps(pps * 1.2)} title="Zoom in"><ZoomIn size={15} /></button>
        <div className="track-add-menu">
          <button className="toolbar-button" onClick={() => addTrack('video')} title="Add video track"><Plus size={15} /> Video</button>
          <button className="toolbar-button" onClick={() => addTrack('audio')} title="Add audio track"><Plus size={15} /> Audio</button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="timeline-left-column" style={{ width: HEADER_WIDTH }}>
          <div className="ruler-corner" />
          {project.tracks.map((track) => <TrackHeader key={track.id} track={track} />)}
        </div>
        <div className="timeline-scroll" ref={scrollRef}>
          <div className="timeline-content" style={{ width: contentWidth }}>
            <Ruler width={contentWidth} />
            <div className="playhead" style={{ left: timeToPixels(currentTime, pps) }}>
              <div className="playhead-handle" />
            </div>
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={`track-row ${track.locked ? 'locked' : ''}`}
                style={{ height: track.height, width: contentWidth }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropMedia(event, track)}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setCurrentTime(pixelsToTime(event.clientX - rect.left, pps));
                }}
              >
                {track.clips.map((clip) => {
                  const mediaId = clip.type === 'video' || clip.type === 'audio' || clip.type === 'image' ? clip.mediaId : undefined;
                  const mediaName = mediaId ? project.media.find((item) => item.id === mediaId)?.name : undefined;
                  return <TimelineClipView key={clip.id} clip={clip} mediaName={mediaName} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
