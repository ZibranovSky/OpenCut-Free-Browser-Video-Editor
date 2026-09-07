import { Type } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

export function TextPanel() {
  const addText = useEditorStore((s) => s.addTextClip);
  return (
    <div className="side-panel-content">
      <div className="panel-heading-row"><div><h2>Text</h2><p>Canvas-rendered titles</p></div></div>
      <button className="text-preset" onClick={addText}><Type size={24} /><strong>Add text</strong><span>5 second title at playhead</span></button>
      <p className="empty-note">Text is rendered by the same canvas compositor used during export, so the exported layout follows the preview.</p>
    </div>
  );
}
