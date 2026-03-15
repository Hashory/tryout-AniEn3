import {
  DEFAULT_TIME_SCALE,
  FolderPlacement,
  TIMELINE_NORMALIZE_VERSION,
  TIMELINE_SCHEMA_VERSION,
  TimelineSnapshot,
} from '../models/timeline.types';
import { normalizeTimelineSnapshot } from './timeline-normalization';

function createMinimalSnapshot(overrides?: Partial<TimelineSnapshot>): TimelineSnapshot {
  const rootFolderSourceId = 'root-folder';
  return {
    root: {
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      rootFolderSourceId,
      timeScale: DEFAULT_TIME_SCALE,
      nextOrdinal: 0,
      normalizeVersion: TIMELINE_NORMALIZE_VERSION,
    },
    stripSources: {},
    folderSources: {
      [rootFolderSourceId]: {
        id: rootFolderSourceId,
        type: 'folder-source',
        name: 'Root',
        bodyTrackCount: 1,
        childPlacementIds: [],
      },
    },
    folderChildren: {
      [rootFolderSourceId]: [],
    },
    placements: {},
    ...overrides,
  };
}

describe('timeline-normalization', () => {
  describe('normalizeTimelineSnapshot', () => {
    it('should converge multi-parent placement to a single parent', () => {
      const rootId = 'root-folder';
      const folderAId = 'folder-a';
      const folderBId = 'folder-b';
      const stripSourceId = 'strip-source-1';
      const placementId = 'placement-1';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderSources: {
          [rootId]: {
            id: rootId,
            type: 'folder-source',
            name: 'Root',
            bodyTrackCount: 1,
            childPlacementIds: [],
          },
          [folderAId]: {
            id: folderAId,
            type: 'folder-source',
            name: 'Folder A',
            bodyTrackCount: 1,
            childPlacementIds: [],
          },
          [folderBId]: {
            id: folderBId,
            type: 'folder-source',
            name: 'Folder B',
            bodyTrackCount: 1,
            childPlacementIds: [],
          },
        },
        folderChildren: {
          [rootId]: [folderAId, folderBId],
          [folderAId]: [placementId],
          [folderBId]: [placementId], // multi-parent
        },
        placements: {
          [folderAId]: {
            id: folderAId,
            type: 'folder-placement',
            sourceId: folderAId,
            durationTicks: 100,
            startTick: 0,
            startRow: 0,
            ordinal: 0,
          },
          [folderBId]: {
            id: folderBId,
            type: 'folder-placement',
            sourceId: folderBId,
            durationTicks: 100,
            startTick: 0,
            startRow: 1,
            ordinal: 1,
          },
          [placementId]: {
            id: placementId,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 50,
            startTick: 0,
            startRow: 0,
            laneSpan: 1,
            ordinal: 0,
          },
        },
      });

      const normalized = normalizeTimelineSnapshot(snapshot);

      // Verify that the placement is only in one folder
      const inFolderA = normalized.folderChildren[folderAId]?.includes(placementId) ?? false;
      const inFolderB = normalized.folderChildren[folderBId]?.includes(placementId) ?? false;

      expect(inFolderA !== inFolderB).toBe(true); // Exists in exactly one
      expect(normalized.placements[placementId]).toBeDefined(); // Placement itself still exists
    });

    it('should push right sibling on collision', () => {
      const rootId = 'root-folder';
      const stripSourceId = 'strip-source-1';
      const placement1Id = 'placement-1';
      const placement2Id = 'placement-2';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderChildren: {
          [rootId]: [placement1Id, placement2Id],
        },
        placements: {
          [placement1Id]: {
            id: placement1Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 100,
            startTick: 0,
            startRow: 0, // Same row
            laneSpan: 1,
            ordinal: 0, // Ordered first
          },
          [placement2Id]: {
            id: placement2Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 50,
            startTick: 50, // Collides with placement 1 (0 to 100)
            startRow: 0, // Same row
            laneSpan: 1,
            ordinal: 1, // Ordered second
          },
        },
      });

      const normalized = normalizeTimelineSnapshot(snapshot);

      expect(normalized.placements[placement1Id]?.startTick).toBe(0);
      expect(normalized.placements[placement2Id]?.startTick).toBe(100); // Pushed to end of placement 1
    });

    it('should push right when laneSpan=2 overlaps', () => {
      const rootId = 'root-folder';
      const stripSourceId = 'strip-source-1';
      const placement1Id = 'placement-1';
      const placement2Id = 'placement-2';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderSources: {
          [rootId]: {
            id: rootId,
            type: 'folder-source',
            name: 'Root',
            bodyTrackCount: 3,
            childPlacementIds: [],
          },
        },
        folderChildren: {
          [rootId]: [placement1Id, placement2Id],
        },
        placements: {
          [placement1Id]: {
            id: placement1Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 100,
            startTick: 0,
            startRow: 0,
            laneSpan: 2, // Covers rows 0 and 1
            ordinal: 0,
          },
          [placement2Id]: {
            id: placement2Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 50,
            startTick: 50, // Time overlap
            startRow: 1, // Overlaps with placement 1's laneSpan (0-1)
            laneSpan: 1,
            ordinal: 1,
          },
        },
      });

      const normalized = normalizeTimelineSnapshot(snapshot);

      expect(normalized.placements[placement1Id]?.startTick).toBe(0);
      expect(normalized.placements[placement2Id]?.startTick).toBe(100); // Pushed right
    });

    it('should correct bodyTrackCount lower bound', () => {
      const rootId = 'root-folder';
      const stripSourceId = 'strip-source-1';
      const placementId = 'placement-1';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderSources: {
          [rootId]: {
            id: rootId,
            type: 'folder-source',
            name: 'Root',
            bodyTrackCount: 1, // Initially too small
            childPlacementIds: [],
          },
        },
        folderChildren: {
          [rootId]: [placementId],
        },
        placements: {
          [placementId]: {
            id: placementId,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 100,
            startTick: 0,
            startRow: 2, // Row 2, so max track count needed is 3 (2 + laneSpan 1)
            laneSpan: 1,
            ordinal: 0,
          },
        },
      });

      const normalized = normalizeTimelineSnapshot(snapshot);

      expect(normalized.folderSources[rootId]?.bodyTrackCount).toBe(3); // Corrected to 3
    });

    it('should only push folder-placement on sibling collision', () => {
      const rootId = 'root-folder';
      const folderAId = 'folder-a';
      const folderPlacementId = 'folder-placement';
      const stripSourceId = 'strip-source-1';
      const stripPlacementId = 'strip-placement';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderSources: {
          [rootId]: {
            id: rootId,
            type: 'folder-source',
            name: 'Root',
            bodyTrackCount: 2,
            childPlacementIds: [],
          },
          [folderAId]: {
            id: folderAId,
            type: 'folder-source',
            name: 'Folder A',
            bodyTrackCount: 1,
            childPlacementIds: [],
          },
        },
        folderChildren: {
          [rootId]: [stripPlacementId, folderPlacementId],
          [folderAId]: [],
        },
        placements: {
          [stripPlacementId]: {
            id: stripPlacementId,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 100,
            startTick: 0,
            startRow: 0, // Covers row 0
            laneSpan: 1,
            ordinal: 0,
          },
          [folderPlacementId]: {
            id: folderPlacementId,
            type: 'folder-placement',
            sourceId: folderAId,
            durationTicks: 100,
            startTick: 50, // Time overlap
            startRow: 0, // Row overlap. Folder spans bodyTrackCount + 1 (1+1=2) rows: 0, 1. Overlaps with strip!
            ordinal: 1,
          },
        },
      });

      const normalizedCollide = normalizeTimelineSnapshot(snapshot);

      // Folder placement overlaps, should be pushed
      expect(normalizedCollide.placements[folderPlacementId]?.startTick).toBe(100);

      // Change to non-colliding
      const snapshotNoCollide = JSON.parse(JSON.stringify(snapshot)) as TimelineSnapshot;
      (snapshotNoCollide.placements[folderPlacementId] as FolderPlacement).startRow = 1; // Now covers rows 1, 2. Strip covers row 0. No overlap.

      const normalizedNoCollide = normalizeTimelineSnapshot(snapshotNoCollide);

      // Folder placement does not overlap, should NOT be pushed
      expect(normalizedNoCollide.placements[folderPlacementId]?.startTick).toBe(50);
    });

    it('should be deterministic when applied twice', () => {
      const rootId = 'root-folder';
      const stripSourceId = 'strip-source-1';
      const placement1Id = 'placement-1';
      const placement2Id = 'placement-2';

      const snapshot = createMinimalSnapshot({
        stripSources: {
          [stripSourceId]: {
            id: stripSourceId,
            type: 'strip-source',
            kind: 'media',
            name: 'Strip',
          },
        },
        folderChildren: {
          [rootId]: [placement1Id, placement2Id],
        },
        placements: {
          [placement1Id]: {
            id: placement1Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 100,
            startTick: 0,
            startRow: 0,
            laneSpan: 1,
            ordinal: 0,
          },
          [placement2Id]: {
            id: placement2Id,
            type: 'strip-placement',
            sourceId: stripSourceId,
            sourceOffsetTicks: 0,
            durationTicks: 50,
            startTick: 50, // Will collide and get pushed to 100
            startRow: 0,
            laneSpan: 1,
            ordinal: 1,
          },
        },
      });

      const firstPass = normalizeTimelineSnapshot(snapshot);
      const secondPass = normalizeTimelineSnapshot(firstPass);

      expect(firstPass).toEqual(secondPass);
    });
  });
});
