import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { ClipMediaPool } from '../../engine/rendering/ClipMediaPool';
import { FrameComposer } from '../../engine/rendering/FrameComposer';
import { usePlayback } from '../../hooks/usePlayback';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip } from '../../types/project';
import { formatTimecode, getProjectDuration } from '../../utils/time';

function isVisual(clip: TimelineClip | undefined): clip is Extract<TimelineClip, { type: 'video' | 'image' | 'text' }> {
  return !!clip && (clip.type === 'video' || clip.type === 'image' || clip.type === 'text');
}

export function PreviewPanel() {
  const project = useEditorStore((s) => s.project);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const updateClip = useEditorStore((s) => s.updateClip);
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const endTransaction = useEditorStore((s) => s.endTransaction);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderToken = useRef(0);
  const dragging = useRef(false);
  const pool = useMemo(() => new ClipMediaPool(), []);
  const composer = useMemo(() => new FrameComposer(pool), [pool]);
  usePlayback(pool);

  useEffect(() => () => pool.destroy(), [pool]);
  useEffect(() => { if (project) void pool.prepareProject(project); }, [pool, project]);
  useEffect(() => {
    if (!project || !canvasRef.current) return;
    const token = ++renderToken.current;
    const canvas = canvasRef.current;
    void (async () => {
      if (!isPlaying) await pool.seek(project, currentTime);
      if (token !== renderToken.current) return;
      await composer.render(project, currentTime, canvas, {
        shouldCommit: () => token === renderToken.current,
      });
    })();
  }, [composer, currentTime, isPlaying, pool, project]);

  if (!project) return null;
  const duration = getProjectDuration(project.tracks);
  const selected = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId);
  const selectedVisual = isVisual(selected) ? selected : undefined;

  const overlaySize = (() => {
    if (!selectedVisual) return null;
    if (selectedVisual.type === 'text') {
      return {
        width: Math.min(project.settings.width * 0.8, Math.max(140, selectedVisual.text.length * selectedVisual.style.fontSize * 0.58)) * selectedVisual.transform.scaleX,
        height: selectedVisual.style.fontSize * 1.4 * selectedVisual.transform.scaleY,
      };
    }
    const asset = project.media.find((item) => item.id === selectedVisual.mediaId);
    if (!asset?.width || !asset.height) return { width: project.settings.width * 0.5, height: project.settings.height * 0.5 };
    const fit = Math.min(project.settings.width / asset.width, project.settings.height / asset.height);
    return { width: asset.width * fit * selectedVisual.transform.scaleX, height: asset.height * fit * selectedVisual.transform.scaleY };
  })();

  const step = (direction: number) => {
    setPlaying(false);
    setCurrentTime(currentTime + direction / project.settings.frameRate);
  };

  return (
    <section className="preview-panel" aria-label="Preview">
      <div className="preview-workspace">
        <div
          className="preview-stage"
          style={{ aspectRatio: `${project.settings.width} / ${project.settings.height}` }}
          onPointerMove={(event) => {
            if (!dragging.current || !selectedVisual) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * project.settings.width;
            const y = ((event.clientY - rect.top) / rect.height) * project.settings.height;
            updateClip(selectedVisual.id, (clip) => isVisual(clip) ? { ...clip, transform: { ...clip.transform, x, y } } : clip, false);
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            endTransaction();
          }}
        >
          <canvas ref={canvasRef} className="preview-canvas" />
          {selectedVisual && overlaySize && (
            <div
              className="transform-box"
              aria-label="Move selected layer"
              style={{
                left: `${(selectedVisual.transform.x / project.settings.width) * 100}%`,
                top: `${(selectedVisual.transform.y / project.settings.height) * 100}%`,
                width: `${(overlaySize.width / project.settings.width) * 100}%`,
                height: `${(overlaySize.height / project.settings.height) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${selectedVisual.transform.rotation}deg)`,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                dragging.current = true;
                beginTransaction();
                event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
              }}
            />
          )}
        </div>
      </div>
      <div className="preview-controls">
        <button className="icon-button" onClick={() => step(-1)} title="Previous frame"><SkipBack size={17} /></button>
        <button className="play-button" onClick={() => {
          if (!isPlaying) void pool.sync(project, currentTime, true);
          else pool.pauseAll();
          setPlaying(!isPlaying);
        }} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="icon-button" onClick={() => step(1)} title="Next frame"><SkipForward size={17} /></button>
        <span className="timecode">{formatTimecode(currentTime)} <span>/</span> {formatTimecode(duration)}</span>
      </div>
    </section>
  );
}
