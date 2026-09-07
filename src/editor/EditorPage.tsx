import { Download, Film, Home, Redo2, Save, Type, Undo2, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadProject, saveProject } from '../database/projectRepository';
import { useAutosave } from '../hooks/useAutosave';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useEditorStore } from '../store/editorStore';
import { MediaPanel } from './media/MediaPanel';
import { PreviewPanel } from './preview/PreviewPanel';
import { PropertiesPanel } from './properties/PropertiesPanel';
import { TextPanel } from './properties/TextPanel';
import { Timeline } from './timeline/Timeline';
import { TransitionsPanel } from './transitions/TransitionsPanel';
import { ExportDialog } from './ExportDialog';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useEditorStore((s) => s.project);
  const load = useEditorStore((s) => s.loadProject);
  const renameProject = useEditorStore((s) => s.renameProject);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const pastCount = useEditorStore((s) => s.past.length);
  const futureCount = useEditorStore((s) => s.future.length);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const [tab, setTab] = useState<'media' | 'text' | 'transitions'>('media');
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useAutosave();
  useKeyboardShortcuts();

  useEffect(() => {
    if (!id) return;
    if (project?.id === id) { setLoading(false); return; }
    setLoading(true);
    void loadProject(id).then((found) => {
      if (!found) setLoadError('Project not found in this browser.');
      else load(found);
    }).catch(() => setLoadError('Could not open this local project.')).finally(() => setLoading(false));
  }, [id, load, project?.id]);

  if (loading) return <div className="center-screen"><span className="spinner" /> Opening project…</div>;
  if (loadError || !project) return <div className="center-screen error-screen"><strong>{loadError ?? 'Project unavailable.'}</strong><button className="primary-button" onClick={() => navigate('/')}>Back to projects</button></div>;

  const manualSave = async () => {
    setSaveStatus('saving');
    try { await saveProject(project); setSaveStatus('saved'); } catch { setSaveStatus('error'); }
  };

  return (
    <main className="editor-page">
      <header className="top-bar">
        <button className="brand editor-brand" onClick={() => navigate('/')}><span className="brand-mark"><Film size={16} /></span><strong>OpenCut</strong></button>
        <div className="project-title-wrap"><input key={project.id} defaultValue={project.name} onBlur={(event) => event.target.value !== project.name && renameProject(event.target.value)} aria-label="Project name" /></div>
        <div className="top-center-actions"><button className="icon-button" onClick={undo} disabled={!pastCount} title="Undo (Ctrl/Cmd+Z)"><Undo2 size={17} /></button><button className="icon-button" onClick={redo} disabled={!futureCount} title="Redo (Ctrl/Cmd+Shift+Z)"><Redo2 size={17} /></button></div>
        <div className={`save-status ${saveStatus}`}><span className="status-dot" />{saveStatus === 'saved' ? 'Saved locally' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved'}</div>
        <button className="icon-button" onClick={() => void manualSave()} title="Save now (Ctrl/Cmd+S)"><Save size={17} /></button>
        <button className="export-button" onClick={() => setExportOpen(true)}><Download size={16} /> Export</button>
      </header>
      <div className="editor-main">
        <nav className="tool-rail" aria-label="Editor tools">
          <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}><Home size={19} /><span>Media</span></button>
          <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}><Type size={19} /><span>Text</span></button>
          <button className={tab === 'transitions' ? 'active' : ''} onClick={() => setTab('transitions')}><WandSparkles size={19} /><span>Transitions</span></button>
        </nav>
        <aside className="left-panel">{tab === 'media' ? <MediaPanel /> : tab === 'text' ? <TextPanel /> : <TransitionsPanel />}</aside>
        <PreviewPanel />
        <PropertiesPanel />
      </div>
      <Timeline />
      <footer className="status-bar"><span>{project.settings.width}×{project.settings.height}</span><span>{project.settings.frameRate} fps</span><span>Local project · schema v{project.schemaVersion}</span></footer>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </main>
  );
}
