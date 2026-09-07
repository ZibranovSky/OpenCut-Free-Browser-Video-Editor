import Dexie, { type EntityTable } from 'dexie';
import type { VideoProject } from '../types/project';

export interface MediaBlobRecord {
  id: string;
  projectId: string;
  blob: Blob;
}

export class OpenCutDB extends Dexie {
  projects!: EntityTable<VideoProject, 'id'>;
  mediaBlobs!: EntityTable<MediaBlobRecord, 'id'>;

  constructor() {
    super('opencut');
    this.version(1).stores({
      projects: 'id, updatedAt, createdAt',
      mediaBlobs: 'id, projectId',
    });
  }
}

export const db = new OpenCutDB();
