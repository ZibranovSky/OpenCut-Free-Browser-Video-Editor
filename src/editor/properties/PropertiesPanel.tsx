import { SlidersHorizontal } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import type { TimelineClip } from '../../types/project';

function NumberField({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <div className="number-wrap"><input type="number" value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0} step={step} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <small>{suffix}</small>}</div>
    </label>
  );
}

function RangeField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number, history: boolean) => void }) {
  const begin = useEditorStore((s) => s.beginTransaction);
  const end = useEditorStore((s) => s.endTransaction);
  return (
    <label className="range-field">
      <div><span>{label}</span><strong>{Math.round(value)}</strong></div>
      <input type="range" min={min} max={max} step={step} value={value} onPointerDown={begin} onChange={(event) => onChange(Number(event.target.value), false)} onPointerUp={end} />
    </label>
  );
}

export function PropertiesPanel() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const updateClip = useEditorStore((s) => s.updateClip);
  if (!project) return null;
  const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === selectedClipId);

  const patchClip = (updater: (clip: TimelineClip) => TimelineClip, history = true) => {
    if (!clip) return;
    updateClip(clip.id, updater, history);
  };

  if (!clip) {
    return (
      <aside className="properties-panel">
        <div className="properties-title"><SlidersHorizontal size={17} /><span>Project</span></div>
        <div className="properties-section">
          <h3>Canvas</h3>
          <div className="project-stat"><span>Resolution</span><strong>{project.settings.width}×{project.settings.height}</strong></div>
          <div className="project-stat"><span>Frame rate</span><strong>{project.settings.frameRate} fps</strong></div>
          <div className="project-stat"><span>Aspect</span><strong>{project.settings.aspectRatio}</strong></div>
          <div className="project-stat"><span>Background</span><span className="color-chip" style={{ background: project.settings.backgroundColor }} /></div>
        </div>
        <p className="properties-help">Select a clip to edit transform, audio, text, or effect properties.</p>
      </aside>
    );
  }

  const isVisual = clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
  return (
    <aside className="properties-panel">
      <div className="properties-title"><SlidersHorizontal size={17} /><span>{clip.type[0].toUpperCase() + clip.type.slice(1)} properties</span></div>
      <div className="properties-scroll">
        <div className="properties-section">
          <h3>Timing</h3>
          <NumberField label="Start" value={clip.timelineStart} step={0.01} min={0} suffix="s" onChange={(value) => patchClip((c) => ({ ...c, timelineStart: Math.max(0, value) } as TimelineClip))} />
          <NumberField label="Duration" value={clip.timelineDuration} step={0.01} min={1 / project.settings.frameRate} suffix="s" onChange={(value) => patchClip((c) => ({ ...c, timelineDuration: Math.max(1 / project.settings.frameRate, value) } as TimelineClip))} />
        </div>

        {isVisual && (
          <div className="properties-section">
            <h3>Transform</h3>
            <NumberField label="X" value={clip.transform.x} onChange={(value) => patchClip((c) => isVisualClip(c) ? { ...c, transform: { ...c.transform, x: value } } : c)} />
            <NumberField label="Y" value={clip.transform.y} onChange={(value) => patchClip((c) => isVisualClip(c) ? { ...c, transform: { ...c.transform, y: value } } : c)} />
            <NumberField label="Scale X" value={clip.transform.scaleX * 100} step={1} min={1} max={500} suffix="%" onChange={(value) => patchClip((c) => isVisualClip(c) ? { ...c, transform: { ...c.transform, scaleX: value / 100 } } : c)} />
            <NumberField label="Scale Y" value={clip.transform.scaleY * 100} step={1} min={1} max={500} suffix="%" onChange={(value) => patchClip((c) => isVisualClip(c) ? { ...c, transform: { ...c.transform, scaleY: value / 100 } } : c)} />
            <NumberField label="Rotation" value={clip.transform.rotation} step={1} suffix="°" onChange={(value) => patchClip((c) => isVisualClip(c) ? { ...c, transform: { ...c.transform, rotation: value } } : c)} />
            <RangeField label="Opacity" value={clip.opacity * 100} min={0} max={100} onChange={(value, history) => patchClip((c) => isVisualClip(c) ? { ...c, opacity: value / 100 } : c, history)} />
          </div>
        )}

        {clip.type === 'video' && (
          <>
            <div className="properties-section">
              <h3>Video</h3>
              <NumberField label="Speed" value={clip.playbackRate} step={0.05} min={0.25} max={4} suffix="×" onChange={(value) => patchClip((c) => c.type === 'video' ? { ...c, playbackRate: Math.max(0.25, Math.min(4, value)), timelineDuration: c.sourceDuration / Math.max(0.25, Math.min(4, value)) } : c)} />
              <RangeField label="Volume" value={clip.volume * 100} min={0} max={100} onChange={(value, history) => patchClip((c) => c.type === 'video' ? { ...c, volume: value / 100 } : c, history)} />
              <label className="checkbox-row"><input type="checkbox" checked={clip.muted} onChange={() => patchClip((c) => c.type === 'video' ? { ...c, muted: !c.muted } : c)} /><span>Mute source audio</span></label>
              <NumberField label="Fade in" value={clip.fadeIn} step={0.1} min={0} max={clip.timelineDuration} suffix="s" onChange={(value) => patchClip((c) => c.type === 'video' ? { ...c, fadeIn: Math.max(0, Math.min(c.timelineDuration, value)) } : c)} />
              <NumberField label="Fade out" value={clip.fadeOut} step={0.1} min={0} max={clip.timelineDuration} suffix="s" onChange={(value) => patchClip((c) => c.type === 'video' ? { ...c, fadeOut: Math.max(0, Math.min(c.timelineDuration, value)) } : c)} />
            </div>
            <div className="properties-section">
              <h3>Effects</h3>
              <RangeField label="Brightness" value={clip.effects.brightness} min={-100} max={100} onChange={(value, history) => patchClip((c) => c.type === 'video' ? { ...c, effects: { ...c.effects, brightness: value } } : c, history)} />
              <RangeField label="Contrast" value={clip.effects.contrast} min={-100} max={100} onChange={(value, history) => patchClip((c) => c.type === 'video' ? { ...c, effects: { ...c.effects, contrast: value } } : c, history)} />
              <RangeField label="Saturation" value={clip.effects.saturation} min={-100} max={100} onChange={(value, history) => patchClip((c) => c.type === 'video' ? { ...c, effects: { ...c.effects, saturation: value } } : c, history)} />
              <RangeField label="Grayscale" value={clip.effects.grayscale} min={0} max={100} onChange={(value, history) => patchClip((c) => c.type === 'video' ? { ...c, effects: { ...c.effects, grayscale: value } } : c, history)} />
            </div>
          </>
        )}

        {clip.type === 'audio' && (
          <div className="properties-section">
            <h3>Audio</h3>
            <RangeField label="Volume" value={clip.volume * 100} min={0} max={100} onChange={(value, history) => patchClip((c) => c.type === 'audio' ? { ...c, volume: value / 100 } : c, history)} />
            <label className="checkbox-row"><input type="checkbox" checked={clip.muted} onChange={() => patchClip((c) => c.type === 'audio' ? { ...c, muted: !c.muted } : c)} /><span>Mute clip</span></label>
            <NumberField label="Fade in" value={clip.fadeIn} step={0.1} min={0} max={clip.timelineDuration} suffix="s" onChange={(value) => patchClip((c) => c.type === 'audio' ? { ...c, fadeIn: Math.max(0, Math.min(c.timelineDuration, value)) } : c)} />
            <NumberField label="Fade out" value={clip.fadeOut} step={0.1} min={0} max={clip.timelineDuration} suffix="s" onChange={(value) => patchClip((c) => c.type === 'audio' ? { ...c, fadeOut: Math.max(0, Math.min(c.timelineDuration, value)) } : c)} />
          </div>
        )}

        {clip.type === 'text' && (
          <div className="properties-section">
            <h3>Text</h3>
            <label className="stack-field"><span>Content</span><textarea value={clip.text} rows={3} onChange={(event) => patchClip((c) => c.type === 'text' ? { ...c, text: event.target.value } : c)} /></label>
            <NumberField label="Font size" value={clip.style.fontSize} min={8} max={500} suffix="px" onChange={(value) => patchClip((c) => c.type === 'text' ? { ...c, style: { ...c.style, fontSize: value } } : c)} />
            <NumberField label="Weight" value={clip.style.fontWeight} step={100} min={100} max={900} onChange={(value) => patchClip((c) => c.type === 'text' ? { ...c, style: { ...c.style, fontWeight: value } } : c)} />
            <label className="field-row"><span>Color</span><input type="color" value={clip.style.color} onChange={(event) => patchClip((c) => c.type === 'text' ? { ...c, style: { ...c.style, color: event.target.value } } : c)} /></label>
            <label className="field-row"><span>Alignment</span><select value={clip.style.textAlign} onChange={(event) => patchClip((c) => c.type === 'text' ? { ...c, style: { ...c.style, textAlign: event.target.value as CanvasTextAlign } } : c)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
        )}
      </div>
    </aside>
  );
}

function isVisualClip(clip: TimelineClip): clip is Extract<TimelineClip, { type: 'video' | 'image' | 'text' }> {
  return clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
}
