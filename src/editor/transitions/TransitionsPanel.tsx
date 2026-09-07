import { ArrowLeft, ArrowRight, Blend, CircleOff } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import type { TransitionType } from '../../types/project';

const options: Array<{ type: TransitionType; name: string; icon: typeof Blend }> = [
  { type: 'crossfade', name: 'Crossfade', icon: Blend },
  { type: 'fade', name: 'Fade', icon: CircleOff },
  { type: 'slide-left', name: 'Slide Left', icon: ArrowLeft },
  { type: 'slide-right', name: 'Slide Right', icon: ArrowRight },
];

export function TransitionsPanel() {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);
  const addTransition = useEditorStore((s) => s.addTransition);
  const remove = useEditorStore((s) => s.removeTransitionsForSelected);
  const existing = project?.transitions.find((item) => item.fromClipId === selectedId || item.toClipId === selectedId);
  return (
    <div className="side-panel-content">
      <div className="panel-heading-row"><div><h2>Transitions</h2><p>Apply between adjacent visual clips</p></div></div>
      {!selectedId && <p className="empty-note">Select a video or image clip, then choose a transition. OpenCut creates a short overlap with the following clip.</p>}
      <div className="transition-list">
        {options.map(({ type, name, icon: Icon }) => (
          <button className={`transition-card ${existing?.type === type ? 'selected' : ''}`} key={type} onClick={() => addTransition(type)} disabled={!selectedId}>
            <Icon size={20} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      {existing && <button className="secondary-button full-width" onClick={remove}>Remove transition</button>}
    </div>
  );
}
