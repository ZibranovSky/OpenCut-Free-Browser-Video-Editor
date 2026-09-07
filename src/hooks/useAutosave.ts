import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { saveProject } from '../database/projectRepository';

export function useAutosave(): void {
  const project = useEditorStore((s) => s.project);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);

  useEffect(() => {
    if (!project || saveStatus !== 'unsaved') return;
    const timer = window.setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProject(project);
        setSaveStatus('saved');
      } catch (error) {
        console.error('Autosave failed', error);
        setSaveStatus('error');
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, project?.updatedAt, saveStatus, setSaveStatus]);
}
