import { db } from './db';
import type { ProjectSummary, VideoProject } from '../types/project';
import { getProjectDuration } from '../utils/time';

export async function saveProject(project: VideoProject): Promise<void> {
  await db.projects.put({ ...project, updatedAt: Date.now() });
}

export async function loadProject(id: string): Promise<VideoProject | undefined> {
  return db.projects.get(id);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    width: project.settings.width,
    height: project.settings.height,
    duration: getProjectDuration(project.tracks),
  }));
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.mediaBlobs, async () => {
    await db.projects.delete(id);
    await db.mediaBlobs.where('projectId').equals(id).delete();
  });
}

export async function saveMediaBlob(projectId: string, id: string, blob: Blob): Promise<void> {
  await db.mediaBlobs.put({ id, projectId, blob });
}

export async function loadMediaBlob(id: string): Promise<Blob | undefined> {
  return (await db.mediaBlobs.get(id))?.blob;
}
