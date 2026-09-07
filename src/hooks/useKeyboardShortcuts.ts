import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { saveProject } from '../database/projectRepository';

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (state.project) {
          state.setSaveStatus('saving');
          void saveProject(state.project)
            .then(() => state.setSaveStatus('saved'))
            .catch(() => state.setSaveStatus('error'));
        }
        return;
      }
      if (isEditable(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.setPlaying(!state.isPlaying);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.deleteSelected();
      } else if (event.key.toLowerCase() === 's' && !mod) {
        event.preventDefault();
        state.splitSelected();
      } else if (mod && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        state.redo();
      } else if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        state.undo();
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        state.duplicateSelected();
      } else if (event.key === '+' || event.key === '=') {
        state.setPixelsPerSecond(state.pixelsPerSecond * 1.2);
      } else if (event.key === '-') {
        state.setPixelsPerSecond(state.pixelsPerSecond / 1.2);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const fps = state.project?.settings.frameRate ?? 30;
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        state.setCurrentTime(state.currentTime + direction * (event.shiftKey ? 10 / fps : 1 / fps));
      } else if (event.key.toLowerCase() === 'n') {
        state.toggleSnapping();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
