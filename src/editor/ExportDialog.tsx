import { Download, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExportEngine, type ExportFormat } from '../engine/export/ExportEngine';
import { useEditorStore } from '../store/editorStore';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useEditorStore((s) => s.project);
  const formats = useMemo(() => ExportEngine.getFormats(), []);
  const defaultFormat = formats.find((item) => item.id === 'mp4' && item.available)?.id
    ?? formats.find((item) => item.available)?.id
    ?? 'mp4';
  const [format, setFormat] = useState<ExportFormat>(defaultFormat);
  const [fps, setFps] = useState(project?.settings.frameRate ?? 30);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string; size: number } | null>(null);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const selectedFormat = formats.find((item) => item.id === format);
  const canExport = formats.some((item) => item.available) && Boolean(selectedFormat?.available);

  useEffect(() => () => {
    controller.current?.abort();
    if (result?.url) URL.revokeObjectURL(result.url);
  }, [result?.url]);

  if (!project) return null;

  const start = async () => {
    setError(null);
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setRunning(true);
    setProgress(0);
    controller.current = new AbortController();
    const engine = new ExportEngine();
    try {
      const output = await engine.render(project, {
        frameRate: fps,
        format,
        signal: controller.current.signal,
        onProgress: (event) => {
          const label = event.phase === 'preparing'
            ? 'Preparing media'
            : event.phase === 'rendering'
              ? 'Rendering video in real time'
              : event.phase === 'transcoding'
                ? 'Converting to MP4 locally'
                : 'Finalizing video';
          setPhase(label);
          setProgress(event.progress);
        },
      });
      const url = URL.createObjectURL(output.blob);
      const filename = ExportEngine.fileName(project.name, output.extension);
      setResult({ url, filename, size: output.blob.size });
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setPhase('Export complete');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setPhase('Export cancelled');
      else setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-header">
          <div><h2 id="export-title">Export video</h2><p>Render your timeline locally in this browser.</p></div>
          <button className="icon-button" onClick={onClose} disabled={running}><X size={18} /></button>
        </div>
        <div className="export-grid">
          <label><span>Resolution</span><strong>{project.settings.width} × {project.settings.height}</strong><small>Project resolution</small></label>
          <label>
            <span>Frame rate</span>
            <select value={fps} onChange={(event) => setFps(Number(event.target.value))} disabled={running}>
              {[24, 30, 60].map((value) => <option key={value} value={value}>{value} fps</option>)}
            </select>
          </label>
          <label>
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} disabled={running}>
              {formats.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.label}{item.available ? '' : ' — unavailable'}</option>)}
            </select>
            <small>{selectedFormat?.detail ?? 'No compatible export format'}</small>
          </label>
        </div>
        <div className="export-note">
          MP4 uses native browser H.264 recording when available. If your browser cannot record MP4 directly, OpenCut renders WebM first and converts it to MP4 locally with FFmpeg/WASM. The FFmpeg fallback downloads its processing core only when needed; your media is not uploaded.
        </div>
        {(running || progress > 0) && (
          <div className="export-progress"><div className="progress-label"><span>{phase}</span><strong>{Math.round(progress * 100)}%</strong></div><div className="progress-track"><div style={{ width: `${progress * 100}%` }} /></div></div>
        )}
        {error && <div className="error-banner">{error}</div>}
        {result && <a className="download-result" href={result.url} download={result.filename}><Download size={16} /> Download {result.filename} <span>{(result.size / 1024 / 1024).toFixed(1)} MB</span></a>}
        <div className="modal-actions">
          <button className="secondary-button" onClick={running ? () => controller.current?.abort() : onClose}>{running ? 'Cancel export' : 'Close'}</button>
          <button className="primary-button" onClick={() => void start()} disabled={running || !canExport}>{running ? phase : `Export ${format.toUpperCase()}`}</button>
        </div>
      </div>
    </div>
  );
}
