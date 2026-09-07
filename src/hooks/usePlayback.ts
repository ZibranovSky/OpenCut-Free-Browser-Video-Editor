import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getProjectDuration } from '../utils/time';
import type { ClipMediaPool } from '../engine/rendering/ClipMediaPool';

export function usePlayback(pool: ClipMediaPool): void {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const project = useEditorStore((s) => s.project);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const startRef = useRef({ perf: 0, timeline: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!project) return;
    if (!isPlaying) void pool.sync(project, currentTime, false);
  }, [pool, project, currentTime, isPlaying]);

  useEffect(() => {
    if (!project || !isPlaying) {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      pool.pauseAll();
      return;
    }
    startRef.current = { perf: performance.now(), timeline: currentTime };
    const duration = getProjectDuration(project.tracks);
    let lastMediaSync = 0;
    const tick = (now: number) => {
      const next = startRef.current.timeline + (now - startRef.current.perf) / 1000;
      if (next >= duration) {
        setCurrentTime(duration);
        setPlaying(false);
        return;
      }
      setCurrentTime(next);
      if (now - lastMediaSync > 180) {
        lastMediaSync = now;
        void pool.sync(project, next, true);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  // currentTime is intentionally not a dependency while playback is running.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, project, pool, setCurrentTime, setPlaying]);
}
