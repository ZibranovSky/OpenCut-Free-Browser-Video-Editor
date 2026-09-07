export type ProjectId = string;
export type TrackId = string;
export type ClipId = string;
export type MediaId = string;

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | 'custom';

export interface ProjectSettings {
  width: number;
  height: number;
  frameRate: number;
  backgroundColor: string;
  aspectRatio: AspectRatio;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export interface VideoEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
}

export type MediaType = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: MediaId;
  name: string;
  type: MediaType;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  thumbnailUrl?: string;
  createdAt: number;
}

export interface BaseClip {
  id: ClipId;
  trackId: TrackId;
  type: 'video' | 'audio' | 'image' | 'text';
  timelineStart: number;
  timelineDuration: number;
}

export interface VisualClipFields {
  transform: Transform;
  opacity: number;
}

export interface VideoClip extends BaseClip, VisualClipFields {
  type: 'video';
  mediaId: MediaId;
  sourceStart: number;
  sourceDuration: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  effects: VideoEffects;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioClip extends BaseClip {
  type: 'audio';
  mediaId: MediaId;
  sourceStart: number;
  sourceDuration: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface ImageClip extends BaseClip, VisualClipFields {
  type: 'image';
  mediaId: MediaId;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  textAlign: CanvasTextAlign;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
}

export interface TextClip extends BaseClip, VisualClipFields {
  type: 'text';
  text: string;
  style: TextStyle;
}

export type TimelineClip = VideoClip | AudioClip | ImageClip | TextClip;
export type TrackType = 'video' | 'audio' | 'text';

export interface TimelineTrack {
  id: TrackId;
  type: TrackType;
  name: string;
  clips: TimelineClip[];
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  height: number;
}

export type TransitionType = 'crossfade' | 'fade' | 'slide-left' | 'slide-right';

export interface Transition {
  id: string;
  fromClipId: ClipId;
  toClipId: ClipId;
  type: TransitionType;
  duration: number;
}

export interface VideoProject {
  id: ProjectId;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  media: MediaAsset[];
  tracks: TimelineTrack[];
  transitions: Transition[];
  schemaVersion: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  duration: number;
}

export const defaultTransform = (settings: ProjectSettings): Transform => ({
  x: settings.width / 2,
  y: settings.height / 2,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
});

export const defaultEffects = (): VideoEffects => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: 0,
});
