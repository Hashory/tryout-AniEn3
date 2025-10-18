/**
 * Represents a single media strip on the timeline.
 */
export interface Strip {
  /** A unique identifier for the strip. */
  id: string;
  /** The media source path or identifier. */
  source: string;
  /** The frame number where this strip begins within its track. */
  startFrame: number;
  /** The length of the strip in frames. */
  length: number;
  /** The type identifier for this object. */
  type: 'strip';
}

/**
 * Represents a folder or a track container in the timeline.
 * Folders can be nested.
 */
export interface Folder {
  /** A unique identifier for the folder. */
  id: string;
  /** The display name of the folder. */
  name: string;
  /** The frame number where this folder begins in its parent context. */
  startFrame: number;
  /** The total length of the folder in frames. */
  length: number;
  /**
   * A 2D array representing tracks (outer array) and their items (inner array).
   * Items can be other Strips or nested Folders.
   */
  strips: (Strip | Folder)[][];
  /** Indicates if this is the root folder. */
  root?: boolean;
  /** The type identifier for this object. */
  type: 'folder';
}
