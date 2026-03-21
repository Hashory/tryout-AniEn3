import { Injectable } from '@angular/core';

export interface UploadedTimelineFile {
  fileName: string;
  mimeType: string;
  size: number;
  filePath: string;
  fileUrl: string;
}

interface UploadResponse {
  success: boolean;
  fileName?: string;
  mimeType?: string;
  size?: number;
  filePath?: string;
  fileUrl?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TimelineUploadService {
  private readonly uploadEndpoint = `${window.location.protocol}//${window.location.hostname}:14202/upload`;

  public async uploadFile(file: File): Promise<UploadedTimelineFile> {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(this.uploadEndpoint, {
      method: 'POST',
      body: form,
    });

    const result = (await response.json()) as UploadResponse;
    if (!response.ok || !result.success) {
      throw new Error(result.error ?? 'Upload failed');
    }

    if (!result.fileName || !result.mimeType || !result.filePath || !result.fileUrl) {
      throw new Error('Upload response is missing required fields');
    }

    return {
      fileName: result.fileName,
      mimeType: result.mimeType,
      size: result.size ?? file.size,
      filePath: result.filePath,
      fileUrl: result.fileUrl,
    };
  }
}
