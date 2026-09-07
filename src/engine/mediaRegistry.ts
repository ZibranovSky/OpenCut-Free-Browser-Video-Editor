import type { MediaAsset } from '../types/project';
import { loadMediaBlob } from '../database/projectRepository';

class MediaRegistry {
  private urls = new Map<string, string>();

  register(assetId: string, blob: Blob): string {
    this.release(assetId);
    const url = URL.createObjectURL(blob);
    this.urls.set(assetId, url);
    return url;
  }

  get(assetId: string): string | undefined {
    return this.urls.get(assetId);
  }

  async ensure(asset: MediaAsset): Promise<string | undefined> {
    const existing = this.get(asset.id);
    if (existing) return existing;
    const blob = await loadMediaBlob(asset.id);
    if (!blob) return undefined;
    return this.register(asset.id, blob);
  }

  release(assetId: string): void {
    const url = this.urls.get(assetId);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(assetId);
  }

  clear(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

export const mediaRegistry = new MediaRegistry();
