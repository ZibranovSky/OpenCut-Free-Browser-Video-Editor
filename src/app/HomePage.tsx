import { Clock3, Film, LockKeyhole, Plus, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteProject, listProjects, saveProject } from '../database/projectRepository';
import { useEditorStore } from '../store/editorStore';
import type { AspectRatio, ProjectSettings, ProjectSummary } from '../types/project';
import { formatTimecode } from '../utils/time';

const presets: Record<Exclude<AspectRatio, 'custom'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
};

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createProject = useEditorStore((s) => s.createProject);
  const [name, setName] = useState('My video');
  const [ratio, setRatio] = useState<AspectRatio>('16:9');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [backgroundColor, setBackgroundColor] = useState('#000000');

  const chooseRatio = (next: AspectRatio) => {
    setRatio(next);
    if (next !== 'custom') {
      setWidth(presets[next].width);
      setHeight(presets[next].height);
    }
  };

  const create = async () => {
    const settings: ProjectSettings = { width, height, frameRate: fps, backgroundColor, aspectRatio: ratio };
    const project = createProject(name, settings);
    await saveProject(project);
    navigate(`/editor/${project.id}`);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal new-project-modal">
        <div className="modal-header"><div><h2>New project</h2><p>Choose a canvas, then start editing locally.</p></div></div>
        <label className="stack-field"><span>Project name</span><input value={name} autoFocus onChange={(event) => setName(event.target.value)} /></label>
        <div className="stack-field"><span>Aspect ratio</span><div className="preset-grid">{(['16:9', '9:16', '1:1', '4:3', 'custom'] as AspectRatio[]).map((item) => <button className={ratio === item ? 'selected' : ''} key={item} onClick={() => chooseRatio(item)}>{item}</button>)}</div></div>
        <div className="two-columns">
          <label className="stack-field"><span>Width</span><input type="number" min={320} max={4096} value={width} onChange={(event) => { setWidth(Number(event.target.value)); setRatio('custom'); }} /></label>
          <label className="stack-field"><span>Height</span><input type="number" min={240} max={4096} value={height} onChange={(event) => { setHeight(Number(event.target.value)); setRatio('custom'); }} /></label>
        </div>
        <div className="two-columns">
          <label className="stack-field"><span>Frame rate</span><select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label>
          <label className="stack-field"><span>Background</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></label>
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void create()}>Create project</button></div>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const loadProjectState = useEditorStore((s) => s.loadProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showNew, setShowNew] = useState(false);

  const refresh = () => void listProjects().then(setProjects);
  useEffect(refresh, []);

  const open = async (summary: ProjectSummary) => {
    const { loadProject } = await import('../database/projectRepository');
    const project = await loadProject(summary.id);
    if (!project) return;
    loadProjectState(project);
    navigate(`/editor/${project.id}`);
  };

  const remove = async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete “${summary.name}” and its locally stored media?`)) return;
    await deleteProject(summary.id);
    refresh();
  };

  return (
    <main className="home-page">
      <header className="home-nav"><a className="brand" href="/"><span className="brand-mark"><Film size={18} /></span><strong>OpenCut</strong></a><span className="privacy-pill"><LockKeyhole size={14} /> Local-first editor</span></header>
      <section className="hero">
        <div className="hero-kicker"><Zap size={14} /> Free browser video editor</div>
        <h1>Edit videos online.<br /><span>Completely free.</span></h1>
        <p>Trim, split, add music, text, transitions, and effects directly in your browser. No watermark. No account required.</p>
        <div className="hero-actions"><button className="hero-cta" onClick={() => setShowNew(true)}><Plus size={19} /> Start editing</button><span>Your media is processed locally whenever supported by the editing workflow.</span></div>
      </section>
      <section className="recent-section">
        <div className="section-title"><div><h2>Recent projects</h2><p>Saved in this browser using IndexedDB.</p></div><button className="secondary-button" onClick={() => setShowNew(true)}><Plus size={16} /> New project</button></div>
        {projects.length > 0 ? <div className="project-grid">{projects.map((project) => (
          <article className="project-card" key={project.id} onDoubleClick={() => void open(project)}>
            <button className="project-preview" onClick={() => void open(project)}><span>{project.width} × {project.height}</span><Film size={32} /></button>
            <div className="project-card-meta"><div><strong>{project.name}</strong><span><Clock3 size={12} /> {new Date(project.updatedAt).toLocaleString()} · {formatTimecode(project.duration)}</span></div><button className="tiny-button project-delete" title="Delete project" onClick={() => void remove(project)}><Trash2 size={14} /></button></div>
          </article>
        ))}</div> : <div className="no-projects"><Film size={30} /><strong>No projects yet</strong><span>Create one to start editing.</span></div>}
      </section>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </main>
  );
}
