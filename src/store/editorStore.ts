import { create } from 'zustand';
import type {
  MediaAsset,
  ProjectSettings,
  TimelineClip,
  TimelineTrack,
  Transition,
  TransitionType,
  VideoProject,
} from '../types/project';
import { defaultEffects, defaultTransform } from '../types/project';
import { id } from '../utils/ids';
import { deleteClip, duplicateClip, moveClip, splitClip, trimLeft, trimRight } from '../utils/timelineOps';
import { collectSnapCandidates, getProjectDuration, snapTime } from '../utils/time';

interface Snapshot {
  project: VideoProject;
  selectedClipId: string | null;
}

interface EditorState {
  project: VideoProject | null;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  pixelsPerSecond: number;
  snapping: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  past: Snapshot[];
  future: Snapshot[];
  transactionStart: Snapshot | null;

  createProject: (name: string, settings: ProjectSettings) => VideoProject;
  loadProject: (project: VideoProject) => void;
  renameProject: (name: string) => void;
  setSaveStatus: (status: EditorState['saveStatus']) => void;
  setSelectedClip: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setPixelsPerSecond: (value: number) => void;
  toggleSnapping: () => void;

  addMedia: (asset: MediaAsset) => void;
  addMediaClip: (asset: MediaAsset, timelineStart: number, trackId?: string) => string | undefined;
  addTextClip: () => string | undefined;
  updateSelectedClip: (patch: Partial<TimelineClip>) => void;
  updateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip, history?: boolean) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  splitSelected: () => void;
  moveSelected: (time: number, trackId?: string, history?: boolean) => void;
  trimSelectedLeft: (delta: number, history?: boolean) => void;
  trimSelectedRight: (delta: number, history?: boolean) => void;
  addTransition: (type: TransitionType) => void;
  removeTransitionsForSelected: () => void;
  addTrack: (type: TimelineTrack['type']) => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;

  beginTransaction: () => void;
  endTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
}

function makeDefaultTracks(): TimelineTrack[] {
  return [
    { id: id('track'), type: 'text', name: 'Text', clips: [], locked: false, muted: false, hidden: false, height: 64 },
    { id: id('track'), type: 'video', name: 'Video 1', clips: [], locked: false, muted: false, hidden: false, height: 72 },
    { id: id('track'), type: 'audio', name: 'Audio 1', clips: [], locked: false, muted: false, hidden: false, height: 64 },
  ];
}

function snapshot(state: Pick<EditorState, 'project' | 'selectedClipId'>): Snapshot | null {
  if (!state.project) return null;
  return { project: structuredClone(state.project), selectedClipId: state.selectedClipId };
}

function markUpdated(project: VideoProject): VideoProject {
  return { ...project, updatedAt: Date.now() };
}

function compatibleTrack(track: TimelineTrack, asset: MediaAsset): boolean {
  if (asset.type === 'video' || asset.type === 'image') return track.type === 'video';
  if (asset.type === 'audio') return track.type === 'audio';
  return false;
}

function makeMediaClip(asset: MediaAsset, trackId: string, timelineStart: number, settings: ProjectSettings): TimelineClip {
  const duration = asset.type === 'image' ? 5 : Math.max(1 / settings.frameRate, asset.duration ?? 5);
  if (asset.type === 'video') {
    return {
      id: id('clip'),
      trackId,
      type: 'video',
      mediaId: asset.id,
      timelineStart,
      timelineDuration: duration,
      sourceStart: 0,
      sourceDuration: duration,
      playbackRate: 1,
      transform: defaultTransform(settings),
      opacity: 1,
      volume: 1,
      muted: false,
      effects: defaultEffects(),
      fadeIn: 0,
      fadeOut: 0,
    };
  }
  if (asset.type === 'audio') {
    return {
      id: id('clip'),
      trackId,
      type: 'audio',
      mediaId: asset.id,
      timelineStart,
      timelineDuration: duration,
      sourceStart: 0,
      sourceDuration: duration,
      playbackRate: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };
  }
  return {
    id: id('clip'),
    trackId,
    type: 'image',
    mediaId: asset.id,
    timelineStart,
    timelineDuration: 5,
    transform: defaultTransform(settings),
    opacity: 1,
  };
}

export const useEditorStore = create<EditorState>((set, get) => {
  const withHistory = (updater: (project: VideoProject) => VideoProject, selected?: string | null): void => {
    set((state) => {
      if (!state.project) return state;
      const before = snapshot(state);
      if (!before) return state;
      const project = markUpdated(updater(state.project));
      return {
        project,
        selectedClipId: selected === undefined ? state.selectedClipId : selected,
        past: [...state.past, before].slice(-100),
        future: [],
        saveStatus: 'unsaved',
      };
    });
  };

  return {
    project: null,
    selectedClipId: null,
    currentTime: 0,
    isPlaying: false,
    pixelsPerSecond: 80,
    snapping: true,
    saveStatus: 'saved',
    past: [],
    future: [],
    transactionStart: null,

    createProject: (name, settings) => {
      const now = Date.now();
      const project: VideoProject = {
        id: id('project'),
        name: name.trim() || 'Untitled Project',
        createdAt: now,
        updatedAt: now,
        settings,
        media: [],
        tracks: makeDefaultTracks(),
        transitions: [],
        schemaVersion: 1,
      };
      set({ project, selectedClipId: null, currentTime: 0, past: [], future: [], saveStatus: 'unsaved' });
      return project;
    },

    loadProject: (project) => set({ project, selectedClipId: null, currentTime: 0, past: [], future: [], saveStatus: 'saved' }),
    renameProject: (name) => withHistory((project) => ({ ...project, name: name.trim() || 'Untitled Project' })),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setSelectedClip: (selectedClipId) => set({ selectedClipId }),
    setCurrentTime: (currentTime) => {
      const project = get().project;
      const duration = project ? Math.max(0, getProjectDuration(project.tracks)) : 0;
      set({ currentTime: Math.max(0, Math.min(currentTime, duration || 30)) });
    },
    setPlaying: (isPlaying) => set({ isPlaying }),
    setPixelsPerSecond: (pixelsPerSecond) => set({ pixelsPerSecond: Math.max(10, Math.min(600, pixelsPerSecond)) }),
    toggleSnapping: () => set((state) => ({ snapping: !state.snapping })),

    addMedia: (asset) => withHistory((project) => ({ ...project, media: [...project.media, asset] })),
    addMediaClip: (asset, timelineStart, trackId) => {
      const project = get().project;
      if (!project) return undefined;
      let target = trackId ? project.tracks.find((track) => track.id === trackId && compatibleTrack(track, asset)) : undefined;
      if (!target) target = project.tracks.find((track) => compatibleTrack(track, asset) && !track.locked);
      let nextTracks = project.tracks;
      if (!target) {
        const type: TimelineTrack['type'] = asset.type === 'audio' ? 'audio' : 'video';
        target = { id: id('track'), type, name: `${type === 'audio' ? 'Audio' : 'Video'} ${project.tracks.filter((t) => t.type === type).length + 1}`, clips: [], locked: false, muted: false, hidden: false, height: type === 'video' ? 72 : 64 };
        nextTracks = [...project.tracks, target];
      }
      let start = Math.max(0, timelineStart);
      if (get().snapping) {
        start = snapTime(start, collectSnapCandidates(nextTracks, get().currentTime), 8 / get().pixelsPerSecond).value;
      }
      const clip = makeMediaClip(asset, target.id, start, project.settings);
      withHistory((p) => ({
        ...p,
        tracks: nextTracks.map((track) => track.id === target!.id ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.timelineStart - b.timelineStart) } : track),
      }), clip.id);
      return clip.id;
    },

    addTextClip: () => {
      const project = get().project;
      if (!project) return undefined;
      let textTrack = project.tracks.find((track) => track.type === 'text' && !track.locked);
      let tracks = project.tracks;
      if (!textTrack) {
        textTrack = { id: id('track'), type: 'text', name: 'Text', clips: [], locked: false, muted: false, hidden: false, height: 64 };
        tracks = [textTrack, ...tracks];
      }
      const clipId = id('clip');
      const clip: TimelineClip = {
        id: clipId,
        trackId: textTrack.id,
        type: 'text',
        text: 'Add your text',
        timelineStart: get().currentTime,
        timelineDuration: 5,
        transform: defaultTransform(project.settings),
        opacity: 1,
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: Math.max(32, Math.round(project.settings.height * 0.06)),
          fontWeight: 700,
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          letterSpacing: 0,
          lineHeight: 1.2,
          opacity: 1,
        },
      };
      withHistory((p) => ({ ...p, tracks: tracks.map((track) => track.id === textTrack!.id ? { ...track, clips: [...track.clips, clip] } : track) }), clipId);
      return clipId;
    },

    updateSelectedClip: (patch) => {
      const clipId = get().selectedClipId;
      if (!clipId) return;
      get().updateClip(clipId, (clip) => ({ ...clip, ...patch } as TimelineClip), true);
    },
    updateClip: (clipId, updater, history = true) => {
      const apply = (project: VideoProject) => ({
        ...project,
        tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === clipId ? updater(clip) : clip) })),
      });
      if (history) withHistory(apply);
      else set((state) => state.project ? { project: markUpdated(apply(state.project)), saveStatus: 'unsaved' } : state);
    },

    deleteSelected: () => {
      const clipId = get().selectedClipId;
      if (!clipId) return;
      withHistory((project) => ({ ...project, tracks: deleteClip(project.tracks, clipId), transitions: project.transitions.filter((t) => t.fromClipId !== clipId && t.toClipId !== clipId) }), null);
    },
    duplicateSelected: () => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      const result = duplicateClip(project.tracks, clipId);
      if (!result.newId) return;
      withHistory((p) => ({ ...p, tracks: result.tracks }), result.newId);
    },
    splitSelected: () => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      const result = splitClip(project.tracks, clipId, get().currentTime, project.settings.frameRate);
      if (!result.rightClipId) return;
      withHistory((p) => ({ ...p, tracks: result.tracks, transitions: p.transitions.filter((t) => t.fromClipId !== clipId && t.toClipId !== clipId) }), result.rightClipId);
    },
    moveSelected: (time, trackId, history = true) => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      let start = Math.max(0, time);
      if (get().snapping) start = snapTime(start, collectSnapCandidates(project.tracks, get().currentTime, clipId), 8 / get().pixelsPerSecond).value;
      const apply = (p: VideoProject) => ({ ...p, tracks: moveClip(p.tracks, clipId, start, trackId) });
      if (history) withHistory(apply);
      else set((state) => state.project ? { project: markUpdated(apply(state.project)), saveStatus: 'unsaved' } : state);
    },
    trimSelectedLeft: (delta, history = true) => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      const apply = (p: VideoProject) => ({ ...p, tracks: trimLeft(p.tracks, clipId, delta, p.settings.frameRate) });
      if (history) withHistory(apply);
      else set((state) => state.project ? { project: markUpdated(apply(state.project)), saveStatus: 'unsaved' } : state);
    },
    trimSelectedRight: (delta, history = true) => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === clipId);
      const media = clip && (clip.type === 'video' || clip.type === 'audio') ? project.media.find((m) => m.id === clip.mediaId) : undefined;
      const apply = (p: VideoProject) => ({ ...p, tracks: trimRight(p.tracks, clipId, delta, p.settings.frameRate, media?.duration) });
      if (history) withHistory(apply);
      else set((state) => state.project ? { project: markUpdated(apply(state.project)), saveStatus: 'unsaved' } : state);
    },

    addTransition: (type) => {
      const project = get().project;
      const clipId = get().selectedClipId;
      if (!project || !clipId) return;
      const track = project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      const from = track?.clips.find((c) => c.id === clipId);
      if (!track || !from || from.type === 'audio' || from.type === 'text') return;
      const next = [...track.clips]
        .filter((c) => c.id !== from.id && c.type !== 'audio' && c.type !== 'text' && c.timelineStart >= from.timelineStart)
        .sort((a, b) => a.timelineStart - b.timelineStart)[0];
      if (!next) return;
      const duration = Math.min(1, from.timelineDuration / 2, next.timelineDuration / 2);
      const overlapStart = Math.max(from.timelineStart, from.timelineStart + from.timelineDuration - duration);
      withHistory((p) => ({
        ...p,
        tracks: p.tracks.map((t) => t.id === track.id ? { ...t, clips: t.clips.map((c) => c.id === next.id ? { ...c, timelineStart: overlapStart } : c) } : t),
        transitions: [...p.transitions.filter((t) => t.fromClipId !== from.id), { id: id('transition'), fromClipId: from.id, toClipId: next.id, type, duration } as Transition],
      }));
    },
    removeTransitionsForSelected: () => {
      const clipId = get().selectedClipId;
      if (!clipId) return;
      withHistory((p) => ({ ...p, transitions: p.transitions.filter((t) => t.fromClipId !== clipId && t.toClipId !== clipId) }));
    },

    addTrack: (type) => withHistory((project) => ({
      ...project,
      tracks: [...project.tracks, { id: id('track'), type, name: `${type[0].toUpperCase()}${type.slice(1)} ${project.tracks.filter((t) => t.type === type).length + 1}`, clips: [], locked: false, muted: false, hidden: false, height: type === 'video' ? 72 : 64 }],
    })),
    toggleTrackVisibility: (trackId) => withHistory((project) => ({ ...project, tracks: project.tracks.map((t) => t.id === trackId ? { ...t, hidden: !t.hidden } : t) })),
    toggleTrackMute: (trackId) => withHistory((project) => ({ ...project, tracks: project.tracks.map((t) => t.id === trackId ? { ...t, muted: !t.muted } : t) })),
    toggleTrackLock: (trackId) => withHistory((project) => ({ ...project, tracks: project.tracks.map((t) => t.id === trackId ? { ...t, locked: !t.locked } : t) })),

    beginTransaction: () => set((state) => ({ transactionStart: state.transactionStart ?? snapshot(state) })),
    endTransaction: () => set((state) => {
      if (!state.transactionStart) return state;
      return { past: [...state.past, state.transactionStart].slice(-100), future: [], transactionStart: null, saveStatus: 'unsaved' };
    }),
    cancelTransaction: () => set((state) => state.transactionStart ? { project: state.transactionStart.project, selectedClipId: state.transactionStart.selectedClipId, transactionStart: null } : state),
    undo: () => set((state) => {
      const previous = state.past.at(-1);
      const current = snapshot(state);
      if (!previous || !current) return state;
      return { project: previous.project, selectedClipId: previous.selectedClipId, past: state.past.slice(0, -1), future: [current, ...state.future], isPlaying: false, saveStatus: 'unsaved' };
    }),
    redo: () => set((state) => {
      const next = state.future[0];
      const current = snapshot(state);
      if (!next || !current) return state;
      return { project: next.project, selectedClipId: next.selectedClipId, past: [...state.past, current], future: state.future.slice(1), isPlaying: false, saveStatus: 'unsaved' };
    }),
  };
});
