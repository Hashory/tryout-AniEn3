import {
  DEFAULT_TIME_SCALE,
  TIMELINE_NORMALIZE_VERSION,
  TIMELINE_SCHEMA_VERSION,
  TimelineSnapshot,
} from '#app/features/main/main-layout/timeline/models/timeline.types';
import {
  createDemoTimelineSnapshot,
  markAndSweepTimelineSnapshot,
  normalizeTimelineSnapshot,
} from '#app/features/main/main-layout/timeline/services/timeline-normalization';

// Minimal valid snapshot for use as a base in tests.
function makeMinimalSnapshot(): TimelineSnapshot {
  const rootFolderId = 'root-folder';
  return {
    root: {
      schemaVersion: 1,
      rootFolderSourceId: rootFolderId,
      timeScale: DEFAULT_TIME_SCALE,
      nextOrdinal: 0,
      normalizeVersion: 1,
    },
    stripSources: {},
    folderSources: {
      [rootFolderId]: {
        id: rootFolderId,
        type: 'folder-source',
        name: 'Root',
        bodyTrackCount: 1,
        childPlacementIds: [],
      },
    },
    folderChildren: { [rootFolderId]: [] },
    placements: {},
  };
}

// Helpers to build UUIDs deterministically in tests.
const FOLDER_A = 'folder-a';
const SOURCE_A = 'source-a';
const SOURCE_B = 'source-b';
const PLACEMENT_1 = 'placement-1';
const PLACEMENT_2 = 'placement-2';
const PLACEMENT_3 = 'placement-3';
const PLACEMENT_F = 'placement-folder';

describe('normalizeTimelineSnapshot', () => {
  describe('root sanitization', () => {
    it('preserves valid root fields', () => {
      const snapshot = makeMinimalSnapshot();
      const result = normalizeTimelineSnapshot(snapshot);

      expect(result.root.schemaVersion).toBe(TIMELINE_SCHEMA_VERSION);
      expect(result.root.normalizeVersion).toBe(TIMELINE_NORMALIZE_VERSION);
      expect(result.root.rootFolderSourceId).toBe('root-folder');
      expect(result.root.timeScale).toBe(DEFAULT_TIME_SCALE);
      expect(result.root.nextOrdinal).toBe(0);
    });

    it('falls back to DEFAULT_TIME_SCALE when timeScale is invalid', () => {
      const snapshot = makeMinimalSnapshot();
      (snapshot.root as unknown as Record<string, unknown>)['timeScale'] = -1;
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.root.timeScale).toBe(DEFAULT_TIME_SCALE);
    });

    it('falls back to DEFAULT_TIME_SCALE when timeScale is zero', () => {
      const snapshot = makeMinimalSnapshot();
      (snapshot.root as unknown as Record<string, unknown>)['timeScale'] = 0;
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.root.timeScale).toBe(DEFAULT_TIME_SCALE);
    });

    it('uses fallback rootFolderSourceId when missing', () => {
      const snapshot = makeMinimalSnapshot();
      (snapshot.root as unknown as Record<string, unknown>)['rootFolderSourceId'] = '';
      const result = normalizeTimelineSnapshot(snapshot);
      // A fallback folder source should have been created.
      expect(result.root.rootFolderSourceId.length).toBeGreaterThan(0);
      expect(result.folderSources[result.root.rootFolderSourceId]).toBeDefined();
    });

    it('creates root folder source when rootFolderSourceId is not in folderSources', () => {
      const snapshot = makeMinimalSnapshot();
      const missingId = 'non-existent-folder';
      snapshot.root.rootFolderSourceId = missingId;
      delete snapshot.folderSources['root-folder'];
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.folderSources[missingId]).toBeDefined();
      expect(result.folderSources[missingId].name).toBe('Root Timeline');
    });
  });

  describe('stripSource sanitization', () => {
    it('preserves valid strip source fields', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'Clip',
        availableDurationTicks: 100,
      };
      const result = normalizeTimelineSnapshot(snapshot);
      const src = result.stripSources[SOURCE_A];
      expect(src).toBeDefined();
      expect(src.type).toBe('strip-source');
      expect(src.kind).toBe('media');
      expect(src.name).toBe('Clip');
      expect(src.availableDurationTicks).toBe(100);
    });

    it('sets kind to "unknown" when kind is invalid', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'invalid-kind' as never,
        name: 'X',
      };
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.stripSources[SOURCE_A].kind).toBe('unknown');
    });

    it('sets name to "Untitled Strip" when name is empty', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'solid',
        name: '',
      };
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.stripSources[SOURCE_A].name).toBe('Untitled Strip');
    });

    it('accepts all valid kinds', () => {
      const kinds: ('media' | 'generated' | 'solid' | 'unknown')[] = [
        'media',
        'generated',
        'solid',
        'unknown',
      ];
      for (const kind of kinds) {
        const snapshot = makeMinimalSnapshot();
        snapshot.stripSources[SOURCE_A] = {
          id: SOURCE_A,
          type: 'strip-source',
          kind,
          name: 'Test',
        };
        const result = normalizeTimelineSnapshot(snapshot);
        expect(result.stripSources[SOURCE_A].kind).toBe(kind);
      }
    });

    it('omits availableDurationTicks when undefined', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'X',
      };
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.stripSources[SOURCE_A].availableDurationTicks).toBeUndefined();
    });

    it('falls back availableDurationTicks to 1 when value is non-positive', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'X',
        availableDurationTicks: 0,
      };
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.stripSources[SOURCE_A].availableDurationTicks).toBe(1);
    });
  });

  describe('folderSource sanitization', () => {
    it('preserves valid folder source fields', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.folderSources['root-folder'].name = 'My Folder';
      snapshot.folderSources['root-folder'].bodyTrackCount = 3;
      const result = normalizeTimelineSnapshot(snapshot);
      const folder = result.folderSources['root-folder'];
      expect(folder.type).toBe('folder-source');
      expect(folder.name).toBe('My Folder');
      expect(folder.bodyTrackCount).toBeGreaterThanOrEqual(1);
    });

    it('sets name to "Untitled Folder" when name is empty', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.folderSources['root-folder'].name = '';
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.folderSources['root-folder'].name).toBe('Untitled Folder');
    });

    it('sets bodyTrackCount to at least 1', () => {
      const snapshot = makeMinimalSnapshot();
      (snapshot.folderSources['root-folder'] as unknown as Record<string, unknown>)[
        'bodyTrackCount'
      ] = 0;
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.folderSources['root-folder'].bodyTrackCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('placement sanitization', () => {
    function snapshotWithStripPlacement(): TimelineSnapshot {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'Clip',
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 100,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1];
      return snapshot;
    }

    it('preserves valid strip placement', () => {
      const result = normalizeTimelineSnapshot(snapshotWithStripPlacement());
      const p = result.placements[PLACEMENT_1];
      expect(p).toBeDefined();
      expect(p.type).toBe('strip-placement');
      expect(p.sourceId).toBe(SOURCE_A);
      if (p.type === 'strip-placement') {
        expect(p.durationTicks).toBe(100);
        expect(p.laneSpan).toBe(1);
        expect(p.sourceOffsetTicks).toBe(0);
      }
    });

    it('removes strip placement whose sourceId is not in stripSources', () => {
      const snapshot = snapshotWithStripPlacement();
      delete snapshot.stripSources[SOURCE_A];
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.placements[PLACEMENT_1]).toBeUndefined();
    });

    it('removes placement not referenced by any folder', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'X',
      };
      // Placement exists but is not in any folder's children.
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.placements[PLACEMENT_1]).toBeUndefined();
    });

    it('defaults durationTicks to 1 when zero', () => {
      const snapshot = snapshotWithStripPlacement();
      (snapshot.placements[PLACEMENT_1] as unknown as Record<string, unknown>)['durationTicks'] = 0;
      const result = normalizeTimelineSnapshot(snapshot);
      const p = result.placements[PLACEMENT_1];
      if (p?.type === 'strip-placement') {
        expect(p.durationTicks).toBeGreaterThanOrEqual(1);
      }
    });

    it('defaults laneSpan to 1 when zero', () => {
      const snapshot = snapshotWithStripPlacement();
      (snapshot.placements[PLACEMENT_1] as unknown as Record<string, unknown>)['laneSpan'] = 0;
      const result = normalizeTimelineSnapshot(snapshot);
      const p = result.placements[PLACEMENT_1];
      if (p?.type === 'strip-placement') {
        expect(p.laneSpan).toBeGreaterThanOrEqual(1);
      }
    });

    it('removes folder placement whose sourceId is not in folderSources', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.placements[PLACEMENT_F] = {
        id: PLACEMENT_F,
        type: 'folder-placement',
        sourceId: 'non-existent-folder',
        durationTicks: 100,
        startTick: 0,
        startRow: 0,
        ordinal: 0,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_F];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_F];
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.placements[PLACEMENT_F]).toBeUndefined();
    });
  });

  describe('deduplication', () => {
    it('deduplicates repeated child placement IDs in folderChildren', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'X',
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      // List the same placement ID twice.
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1, PLACEMENT_1];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1, PLACEMENT_1];
      const result = normalizeTimelineSnapshot(snapshot);
      const children = result.folderChildren['root-folder'];
      expect(children.filter((id) => id === PLACEMENT_1).length).toBe(1);
    });

    it('removes a placement claimed by multiple folders (only one canonical parent)', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'X',
      };
      snapshot.folderSources[FOLDER_A] = {
        id: FOLDER_A,
        type: 'folder-source',
        name: 'A',
        bodyTrackCount: 1,
        childPlacementIds: [PLACEMENT_1],
      };
      snapshot.placements[PLACEMENT_F] = {
        id: PLACEMENT_F,
        type: 'folder-placement',
        sourceId: FOLDER_A,
        durationTicks: 200,
        startTick: 0,
        startRow: 1,
        ordinal: 1,
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      // Root references the folder placement and strip placement directly.
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_F, PLACEMENT_1];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_F, PLACEMENT_1];
      // Folder A also claims PLACEMENT_1.
      snapshot.folderChildren[FOLDER_A] = [PLACEMENT_1];
      const result = normalizeTimelineSnapshot(snapshot);
      // PLACEMENT_1 should belong to exactly one parent.
      const rootHas = (result.folderChildren['root-folder'] ?? []).includes(PLACEMENT_1);
      const folderAHas = (result.folderChildren[FOLDER_A] ?? []).includes(PLACEMENT_1);
      expect(rootHas && folderAHas).toBe(false);
      expect(rootHas || folderAHas).toBe(true);
    });
  });

  describe('cyclic folder reference handling', () => {
    it('breaks a direct folder cycle', () => {
      const snapshot = makeMinimalSnapshot();
      // folder-a → folder-b → folder-a  (cycle)
      const FOLDER_B = 'folder-b';
      const FOLDER_A_PLACEMENT = 'placement-fa';
      const FOLDER_B_PLACEMENT = 'placement-fb';

      snapshot.folderSources[FOLDER_A] = {
        id: FOLDER_A,
        type: 'folder-source',
        name: 'A',
        bodyTrackCount: 1,
        childPlacementIds: [FOLDER_B_PLACEMENT],
      };
      snapshot.folderSources[FOLDER_B] = {
        id: FOLDER_B,
        type: 'folder-source',
        name: 'B',
        bodyTrackCount: 1,
        childPlacementIds: [FOLDER_A_PLACEMENT],
      };
      snapshot.placements[FOLDER_A_PLACEMENT] = {
        id: FOLDER_A_PLACEMENT,
        type: 'folder-placement',
        sourceId: FOLDER_A,
        durationTicks: 100,
        startTick: 0,
        startRow: 1,
        ordinal: 1,
      };
      snapshot.placements[FOLDER_B_PLACEMENT] = {
        id: FOLDER_B_PLACEMENT,
        type: 'folder-placement',
        sourceId: FOLDER_B,
        durationTicks: 100,
        startTick: 0,
        startRow: 1,
        ordinal: 0,
      };
      snapshot.folderChildren[FOLDER_A] = [FOLDER_B_PLACEMENT];
      snapshot.folderChildren[FOLDER_B] = [FOLDER_A_PLACEMENT];
      // Root contains folder-a.
      snapshot.folderSources['root-folder'].childPlacementIds = [FOLDER_A_PLACEMENT];
      snapshot.folderChildren['root-folder'] = [FOLDER_A_PLACEMENT];

      // Should not throw and should produce a finite result.
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result).toBeDefined();
      // Cycle must be broken: not both folder-placement-a and folder-placement-b can coexist.
      const faExists = !!result.placements[FOLDER_A_PLACEMENT];
      const fbExists = !!result.placements[FOLDER_B_PLACEMENT];
      expect(faExists && fbExists).toBe(false);
    });
  });

  describe('collision resolution (startTick)', () => {
    it('resolves time overlap by pushing later placement forward', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.stripSources[SOURCE_B] = {
        id: SOURCE_B,
        type: 'strip-source',
        kind: 'media',
        name: 'B',
      };
      // Both placements on the same row, both starting at tick 0 → one must be pushed.
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 100,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.placements[PLACEMENT_2] = {
        id: PLACEMENT_2,
        type: 'strip-placement',
        sourceId: SOURCE_B,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 1,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1, PLACEMENT_2];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1, PLACEMENT_2];
      const result = normalizeTimelineSnapshot(snapshot);
      const p1 = result.placements[PLACEMENT_1];
      const p2 = result.placements[PLACEMENT_2];
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      if (!p1 || !p2) return;
      // No overlap: end of one <= start of other.
      const noOverlap =
        p1.startTick + p1.durationTicks <= p2.startTick ||
        p2.startTick + p2.durationTicks <= p1.startTick;
      expect(noOverlap).toBe(true);
    });

    it('does not move placements on different rows', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.stripSources[SOURCE_B] = {
        id: SOURCE_B,
        type: 'strip-source',
        kind: 'media',
        name: 'B',
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 100,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.placements[PLACEMENT_2] = {
        id: PLACEMENT_2,
        type: 'strip-placement',
        sourceId: SOURCE_B,
        sourceOffsetTicks: 0,
        durationTicks: 100,
        startTick: 0,
        startRow: 1,
        laneSpan: 1,
        ordinal: 1,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1, PLACEMENT_2];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1, PLACEMENT_2];
      snapshot.folderSources['root-folder'].bodyTrackCount = 2;
      const result = normalizeTimelineSnapshot(snapshot);
      // Both placements should exist and remain at tick 0 (different rows, no collision).
      expect(result.placements[PLACEMENT_1]?.startTick).toBe(0);
      expect(result.placements[PLACEMENT_2]?.startTick).toBe(0);
    });

    it('resolves cascading collisions deterministically for three same-row strips', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.stripSources[SOURCE_B] = {
        id: SOURCE_B,
        type: 'strip-source',
        kind: 'media',
        name: 'B',
      };
      snapshot.stripSources['source-c'] = {
        id: 'source-c',
        type: 'strip-source',
        kind: 'media',
        name: 'C',
      };

      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.placements[PLACEMENT_2] = {
        id: PLACEMENT_2,
        type: 'strip-placement',
        sourceId: SOURCE_B,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 1,
      };
      snapshot.placements[PLACEMENT_3] = {
        id: PLACEMENT_3,
        type: 'strip-placement',
        sourceId: 'source-c',
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 2,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [
        PLACEMENT_1,
        PLACEMENT_2,
        PLACEMENT_3,
      ];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1, PLACEMENT_2, PLACEMENT_3];

      const result = normalizeTimelineSnapshot(snapshot);
      const placements = [PLACEMENT_1, PLACEMENT_2, PLACEMENT_3]
        .map((id) => result.placements[id])
        .filter((placement): placement is NonNullable<typeof placement> => Boolean(placement))
        .sort((left, right) => left.startTick - right.startTick);

      expect(placements).toHaveLength(3);
      expect(placements[0].startTick).toBe(0);
      expect(placements[1].startTick).toBe(50);
      expect(placements[2].startTick).toBe(100);
    });

    it('pushes a lower-row sibling when overlapped by a laneSpan strip', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.stripSources[SOURCE_B] = {
        id: SOURCE_B,
        type: 'strip-source',
        kind: 'media',
        name: 'B',
      };

      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 100,
        startTick: 0,
        startRow: 0,
        laneSpan: 2,
        ordinal: 0,
      };
      snapshot.placements[PLACEMENT_2] = {
        id: PLACEMENT_2,
        type: 'strip-placement',
        sourceId: SOURCE_B,
        sourceOffsetTicks: 0,
        durationTicks: 70,
        startTick: 20,
        startRow: 1,
        laneSpan: 1,
        ordinal: 1,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1, PLACEMENT_2];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1, PLACEMENT_2];

      const result = normalizeTimelineSnapshot(snapshot);
      const upper = result.placements[PLACEMENT_1];
      const lower = result.placements[PLACEMENT_2];

      expect(upper).toBeDefined();
      expect(lower).toBeDefined();
      if (!upper || !lower) {
        return;
      }

      expect(lower.startTick).toBeGreaterThanOrEqual(upper.startTick + upper.durationTicks);
    });
  });

  describe('bodyTrackCount update', () => {
    it('sets bodyTrackCount to at least cover all occupied rows', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 4, // Occupies row 4
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1];
      snapshot.folderSources['root-folder'].bodyTrackCount = 1;
      const result = normalizeTimelineSnapshot(snapshot);
      // bodyTrackCount must be at least 5 (rows 0-4).
      expect(result.folderSources['root-folder'].bodyTrackCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('folderChildren sync with folderSource.childPlacementIds', () => {
    it('childPlacementIds in folderSource matches folderChildren after normalization', () => {
      const snapshot = makeMinimalSnapshot();
      snapshot.stripSources[SOURCE_A] = {
        id: SOURCE_A,
        type: 'strip-source',
        kind: 'media',
        name: 'A',
      };
      snapshot.placements[PLACEMENT_1] = {
        id: PLACEMENT_1,
        type: 'strip-placement',
        sourceId: SOURCE_A,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      };
      snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1];
      snapshot.folderChildren['root-folder'] = [PLACEMENT_1];
      const result = normalizeTimelineSnapshot(snapshot);
      expect(result.folderSources['root-folder'].childPlacementIds).toEqual(
        result.folderChildren['root-folder'],
      );
    });
  });
});

describe('markAndSweepTimelineSnapshot', () => {
  it('removes unreachable strip sources and placements', () => {
    const snapshot = makeMinimalSnapshot();
    // Orphaned source and placement not referenced from root.
    snapshot.stripSources['orphan-source'] = {
      id: 'orphan-source',
      type: 'strip-source',
      kind: 'media',
      name: 'Orphan',
    };
    // Not added to any folder children.
    const result = markAndSweepTimelineSnapshot(snapshot);
    expect(result.stripSources['orphan-source']).toBeUndefined();
  });

  it('removes unreachable folder sources', () => {
    const snapshot = makeMinimalSnapshot();
    snapshot.folderSources['orphan-folder'] = {
      id: 'orphan-folder',
      type: 'folder-source',
      name: 'Orphan',
      bodyTrackCount: 1,
      childPlacementIds: [],
    };
    snapshot.folderChildren['orphan-folder'] = [];
    const result = markAndSweepTimelineSnapshot(snapshot);
    expect(result.folderSources['orphan-folder']).toBeUndefined();
  });

  it('keeps reachable items', () => {
    const snapshot = makeMinimalSnapshot();
    snapshot.stripSources[SOURCE_A] = {
      id: SOURCE_A,
      type: 'strip-source',
      kind: 'media',
      name: 'A',
    };
    snapshot.placements[PLACEMENT_1] = {
      id: PLACEMENT_1,
      type: 'strip-placement',
      sourceId: SOURCE_A,
      sourceOffsetTicks: 0,
      durationTicks: 50,
      startTick: 0,
      startRow: 0,
      laneSpan: 1,
      ordinal: 0,
    };
    snapshot.folderSources['root-folder'].childPlacementIds = [PLACEMENT_1];
    snapshot.folderChildren['root-folder'] = [PLACEMENT_1];
    const result = markAndSweepTimelineSnapshot(snapshot);
    expect(result.stripSources[SOURCE_A]).toBeDefined();
    expect(result.placements[PLACEMENT_1]).toBeDefined();
  });
});

describe('createDemoTimelineSnapshot', () => {
  it('creates a valid snapshot with required schema fields', () => {
    const snapshot = createDemoTimelineSnapshot();
    expect(snapshot.root.schemaVersion).toBe(TIMELINE_SCHEMA_VERSION);
    expect(snapshot.root.normalizeVersion).toBe(TIMELINE_NORMALIZE_VERSION);
    expect(snapshot.root.timeScale).toBe(DEFAULT_TIME_SCALE);
    expect(snapshot.root.rootFolderSourceId.length).toBeGreaterThan(0);
  });

  it('root folder source exists in folderSources', () => {
    const snapshot = createDemoTimelineSnapshot();
    expect(snapshot.folderSources[snapshot.root.rootFolderSourceId]).toBeDefined();
  });

  it('all placement sourceIds exist in stripSources or folderSources', () => {
    const snapshot = createDemoTimelineSnapshot();
    for (const placement of Object.values(snapshot.placements)) {
      if (placement.type === 'strip-placement') {
        expect(snapshot.stripSources[placement.sourceId]).toBeDefined();
      } else {
        expect(snapshot.folderSources[placement.sourceId]).toBeDefined();
      }
    }
  });

  it('all placements are referenced in folderChildren', () => {
    const snapshot = createDemoTimelineSnapshot();
    const allChildren = new Set(Object.values(snapshot.folderChildren).flat());
    for (const placementId of Object.keys(snapshot.placements)) {
      expect(allChildren.has(placementId)).toBe(true);
    }
  });

  it('folderSource.childPlacementIds matches folderChildren', () => {
    const snapshot = createDemoTimelineSnapshot();
    for (const folderSource of Object.values(snapshot.folderSources)) {
      const children = snapshot.folderChildren[folderSource.id] ?? [];
      expect(folderSource.childPlacementIds).toEqual(children);
    }
  });
});
