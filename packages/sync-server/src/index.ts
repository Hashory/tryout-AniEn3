import { type Extension, Server, type onRequestPayload } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IncomingForm } from 'formidable';
import type { IncomingMessage, ServerResponse } from 'node:http';

const port = 14202;
const uploadDirPath = path.resolve(process.cwd(), 'uploads');

interface ParsedUploadFile {
  filepath: string;
  mimetype?: string | null;
  originalFilename?: string | null;
  size: number;
  newFilename?: string;
}

const toUploadPath = (absolutePath: string): string => path.relative(uploadDirPath, absolutePath);

const isInsideUploadDirectory = (absolutePath: string): boolean => {
  const normalized = path.resolve(absolutePath);
  const relative = path.relative(uploadDirPath, normalized);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const toFormidableFile = (value: unknown): ParsedUploadFile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ParsedUploadFile>;
  if (typeof candidate.filepath !== 'string' || typeof candidate.size !== 'number') {
    return null;
  }

  return {
    filepath: candidate.filepath,
    mimetype: candidate.mimetype,
    originalFilename: candidate.originalFilename,
    size: candidate.size,
    newFilename: candidate.newFilename,
  };
};

const parseMultipartFile = async (request: IncomingMessage): Promise<ParsedUploadFile | null> => {
  await mkdir(uploadDirPath, { recursive: true });

  const form = new IncomingForm({
    uploadDir: uploadDirPath,
    keepExtensions: true,
    filename: (_name: string, extension: string) => `${randomUUID()}${extension}`,
    multiples: false,
  });

  const [, files] = await form.parse(request);
  const fileValue = files.file;
  if (!fileValue) {
    return null;
  }

  const uploadedFile = Array.isArray(fileValue) ? fileValue[0] : fileValue;
  return toFormidableFile(uploadedFile);
};

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(body));
};

const stopDefaultRequestHandler = (): never => {
  // Hocuspocus catches falsy throws to skip its default "Welcome to Hocuspocus!" response.
  throw null;
};

const resolveRequestBaseUrl = (request: IncomingMessage): string => {
  const host = request.headers.host ?? `localhost:${port}`;
  const protocol = request.headers['x-forwarded-proto'];
  const resolvedProtocol = typeof protocol === 'string' && protocol.length > 0 ? protocol : 'http';
  return `${resolvedProtocol}://${host}`;
};

class UploadHttpExtension implements Extension {
  public readonly extensionName = 'upload-http';

  public async onRequest({ request, response }: onRequestPayload): Promise<void> {
    const baseUrl = process.env.UPLOAD_PUBLIC_BASE_URL ?? resolveRequestBaseUrl(request);
    const requestUrl = new URL(request.url ?? '/', baseUrl);
    const isUploadEndpoint = requestUrl.pathname === '/upload';
    const isUploadAssetRequest = requestUrl.pathname.startsWith('/uploads/');
    const shouldHandleCors = isUploadEndpoint || isUploadAssetRequest;

    if (shouldHandleCors) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (request.method === 'OPTIONS' && shouldHandleCors) {
      response.writeHead(204);
      response.end();
      stopDefaultRequestHandler();
    }

    if (request.method === 'POST' && isUploadEndpoint) {
      let uploadedFile: ParsedUploadFile | null = null;
      try {
        uploadedFile = await parseMultipartFile(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown upload error';
        writeJson(response, 500, {
          success: false,
          error: message,
        });
        stopDefaultRequestHandler();
      }

      if (!uploadedFile) {
        writeJson(response, 400, {
          success: false,
          error: 'Missing file field. Please send multipart/form-data with field name "file".',
        });
        stopDefaultRequestHandler();
      }

      const resolvedFile = uploadedFile!;

      if (!isInsideUploadDirectory(resolvedFile.filepath)) {
        writeJson(response, 400, {
          success: false,
          error: 'Invalid uploaded file path.',
        });
        stopDefaultRequestHandler();
      }

      const relativePath = toUploadPath(resolvedFile.filepath).replaceAll('\\', '/');
      const fileUrl = `${baseUrl}/uploads/${encodeURI(relativePath)}`;

      writeJson(response, 200, {
        success: true,
        fileName: resolvedFile.originalFilename ?? 'uploaded-file',
        mimeType: resolvedFile.mimetype ?? 'application/octet-stream',
        size: resolvedFile.size,
        filePath: `/uploads/${relativePath}`,
        fileUrl,
      });
      stopDefaultRequestHandler();
    }

    if (request.method === 'GET' && isUploadAssetRequest) {
      const relativePath = decodeURIComponent(requestUrl.pathname.replace(/^\/uploads\//, ''));
      const absolutePath = path.resolve(uploadDirPath, relativePath);
      if (!isInsideUploadDirectory(absolutePath)) {
        response.writeHead(404);
        response.end();
        stopDefaultRequestHandler();
      }

      const stream = createReadStream(absolutePath);
      stream.on('error', () => {
        response.writeHead(404);
        response.end();
      });
      stream.pipe(response);
      stopDefaultRequestHandler();
    }
  }
}

const server = new Server({
  port,
  address: '0.0.0.0',
  extensions: [
    new UploadHttpExtension(),
    new Logger(),
    new SQLite({
      database: 'hocuspocus.sqlite',
    }),
  ],
});

server.listen();
