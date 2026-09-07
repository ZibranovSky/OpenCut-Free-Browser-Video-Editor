import { FileAudio, FileImage, FileVideo, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { formatTimecode } from '../../utils/time';
import { importMediaFile } from './importMedia';

function MediaIcon({ type }: { type: 'video' | 'audio' | 'image' }) {
  if (type === 'video') return <FileVideo size={18} />;
  if (type === 'audio') return <FileAudio size={18} />;
  return <FileImage size={18} />;
}

export function MediaPanel() {
  const project = useEditorStore((s) => s.project);
  const currentTime = useEditorStore((s) => s.currentTime);
  const addMedia = useEditorStore((s) => s.addMedia);
  const addMediaClip = useEditorStore((s) => s.addMediaClip);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!project) return null;

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      try {
        setBusy(`Reading ${file.name}…`);
        const asset = await importMediaFile(project.id, file);
        addMedia(asset);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not import ${file.name}`);
      }
    }
    setBusy(null);
  };

  return (
    <div className="side-panel-content">
      <div className="panel-heading-row">
        <div><h2>Media</h2><p>Video, audio, and images</p></div>
        <button className="primary-small" onClick={() => inputRef.current?.click()}><Upload size={15} /> Import</button>
      </div>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mp4,.webm,.mov,.mp3,.wav,.png,.jpg,.jpeg,.webp"
        onChange={(event) => event.target.files && void handleFiles(event.target.files)}
      />
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={22} />
        <strong>Drop media here</strong>
        <span>or click to browse</span>
      </div>
      {busy && <div className="processing-state"><span className="spinner" />{busy}</div>}
      {error && <div className="error-banner">{error}</div>}
      <div className="media-grid">
        {project.media.map((asset) => (
          <article
            className="media-card"
            key={asset.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('application/x-opencut-media', asset.id)}
            onDoubleClick={() => addMediaClip(asset, currentTime)}
            title="Drag to timeline or double-click to insert at playhead"
          >
            <div className="media-thumb">
              {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <MediaIcon type={asset.type} />}
              <span className="media-type"><MediaIcon type={asset.type} /></span>
              {asset.duration != null && <span className="media-duration">{formatTimecode(asset.duration).slice(3, 8)}</span>}
            </div>
            <div className="media-meta">
              <strong title={asset.name}>{asset.name}</strong>
              <span>{asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.type}</span>
            </div>
            <button className="media-add" onClick={() => addMediaClip(asset, currentTime)} title="Add at playhead"><Plus size={14} /></button>
          </article>
        ))}
      </div>
      {project.media.length === 0 && <p className="empty-note">Import a real media file to begin. Source files stay in browser storage for this project.</p>}
    </div>
  );
}
