import {
  DEFAULT_TIME_SCALE,
  FolderSource,
  Placement,
  StripSource,
  TIMELINE_NORMALIZE_VERSION,
  TIMELINE_SCHEMA_VERSION,
  TimelineRoot,
  TimelineSnapshot,
} from '#app/features/main/main-layout/timeline/models/timeline.types';

interface NormalizeOptions {
  preferredPlacementIds?: Iterable<string>;
  preferredFolderSourceIds?: Iterable<string>;
}

const FALLBACK_ROOT_FOLDER_SOURCE_ID = '__root_folder_source__';
const STRIP_SOURCE_KINDS = new Set<StripSource['kind']>(['media', 'generated', 'solid', 'unknown']);

export function createDemoTimelineSnapshot(): TimelineSnapshot {
  const rootFolderSourceId = crypto.randomUUID();
  const nestedFolderSourceId = crypto.randomUUID();

  const introSourceId = crypto.randomUUID();
  const montageSourceId = crypto.randomUUID();
  const bRollPrimarySourceId = crypto.randomUUID();
  const bRollAlternateSourceId = crypto.randomUUID();
  const cutawaySourceId = crypto.randomUUID();

  const introPlacementId = crypto.randomUUID();
  const montagePlacementId = crypto.randomUUID();
  const folderPlacementId = crypto.randomUUID();
  const bRollPrimaryPlacementId = crypto.randomUUID();
  const bRollAlternatePlacementId = crypto.randomUUID();
  const cutawayPlacementId = crypto.randomUUID();

  return normalizeTimelineSnapshot({
    root: {
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      rootFolderSourceId,
      timeScale: DEFAULT_TIME_SCALE,
      nextOrdinal: 6,
      normalizeVersion: TIMELINE_NORMALIZE_VERSION,
    },
    stripSources: {
      [introSourceId]: {
        id: introSourceId,
        type: 'strip-source',
        kind: 'media',
        name: 'Intro Clip',
      },
      [montageSourceId]: {
        id: montageSourceId,
        type: 'strip-source',
        kind: 'media',
        name: 'Montage Sequence',
      },
      [bRollPrimarySourceId]: {
        id: bRollPrimarySourceId,
        type: 'strip-source',
        kind: 'media',
        name: 'B-Roll Shot 1',
      },
      [bRollAlternateSourceId]: {
        id: bRollAlternateSourceId,
        type: 'strip-source',
        kind: 'media',
        name: 'B-Roll Shot 2',
      },
      [cutawaySourceId]: {
        id: cutawaySourceId,
        type: 'strip-source',
        kind: 'media',
        name: 'Cutaway Clip',
      },
    },
    folderSources: {
      [rootFolderSourceId]: {
        id: rootFolderSourceId,
        type: 'folder-source',
        name: 'Root Timeline',
        bodyTrackCount: 5,
        childPlacementIds: [introPlacementId, montagePlacementId, folderPlacementId],
      },
      [nestedFolderSourceId]: {
        id: nestedFolderSourceId,
        type: 'folder-source',
        name: 'B-Roll Folder',
        bodyTrackCount: 2,
        childPlacementIds: [bRollPrimaryPlacementId, bRollAlternatePlacementId, cutawayPlacementId],
      },
    },
    folderChildren: {
      [rootFolderSourceId]: [introPlacementId, montagePlacementId, folderPlacementId],
      [nestedFolderSourceId]: [
        bRollPrimaryPlacementId,
        bRollAlternatePlacementId,
        cutawayPlacementId,
      ],
    },
    placements: {
      [introPlacementId]: {
        id: introPlacementId,
        type: 'strip-placement',
        sourceId: introSourceId,
        sourceOffsetTicks: 0,
        durationTicks: 120,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 0,
      },
      [montagePlacementId]: {
        id: montagePlacementId,
        type: 'strip-placement',
        sourceId: montageSourceId,
        sourceOffsetTicks: 0,
        durationTicks: 180,
        startTick: 60,
        startRow: 1,
        laneSpan: 1,
        ordinal: 1,
      },
      [folderPlacementId]: {
        id: folderPlacementId,
        type: 'folder-placement',
        sourceId: nestedFolderSourceId,
        durationTicks: 220,
        startTick: 180,
        startRow: 2,
        ordinal: 2,
      },
      [bRollPrimaryPlacementId]: {
        id: bRollPrimaryPlacementId,
        type: 'strip-placement',
        sourceId: bRollPrimarySourceId,
        sourceOffsetTicks: 0,
        durationTicks: 80,
        startTick: 0,
        startRow: 0,
        laneSpan: 1,
        ordinal: 3,
      },
      [bRollAlternatePlacementId]: {
        id: bRollAlternatePlacementId,
        type: 'strip-placement',
        sourceId: bRollAlternateSourceId,
        sourceOffsetTicks: 0,
        durationTicks: 60,
        startTick: 90,
        startRow: 0,
        laneSpan: 1,
        ordinal: 4,
      },
      [cutawayPlacementId]: {
        id: cutawayPlacementId,
        type: 'strip-placement',
        sourceId: cutawaySourceId,
        sourceOffsetTicks: 0,
        durationTicks: 50,
        startTick: 30,
        startRow: 1,
        laneSpan: 1,
        ordinal: 5,
      },
    },
  });
}

export function normalizeTimelineSnapshot(
  snapshot: TimelineSnapshot,
  options?: NormalizeOptions,
): TimelineSnapshot {
  const preferredPlacementIds = new Set(options?.preferredPlacementIds ?? []);
  const preferredFolderSourceIds = new Set(options?.preferredFolderSourceIds ?? []);

  const stripSources = sanitizeStripSources(snapshot.stripSources);
  const folderChildren = sanitizeFolderChildren(snapshot.folderChildren);
  const folderSources = sanitizeFolderSources(snapshot.folderSources, folderChildren);
  const placements = sanitizePlacements(snapshot.placements);
  const root = sanitizeRoot(snapshot.root, folderSources, folderChildren);

  for (const folderSource of Object.values(folderSources)) {
    folderChildren[folderSource.id] = deduplicateIds(folderChildren[folderSource.id] ?? []);
  }

  const canonicalParents = new Map<string, string>();
  for (const folderSourceId of Object.keys(folderSources).sort()) {
    const nextChildren: string[] = [];
    for (const placementId of folderChildren[folderSourceId] ?? []) {
      if (!(placementId in placements)) {
        continue;
      }

      const existingParent = canonicalParents.get(placementId);
      if (existingParent && existingParent !== folderSourceId) {
        continue;
      }

      canonicalParents.set(placementId, folderSourceId);
      nextChildren.push(placementId);
    }
    folderChildren[folderSourceId] = nextChildren;
  }

  for (const placementId of Object.keys(placements)) {
    const placement = placements[placementId];
    if (!placement) {
      continue;
    }

    if (!canonicalParents.has(placementId)) {
      delete placements[placementId];
      continue;
    }

    if (placement.type === 'strip-placement' && !(placement.sourceId in stripSources)) {
      delete placements[placementId];
      continue;
    }

    if (placement.type === 'folder-placement' && !(placement.sourceId in folderSources)) {
      delete placements[placementId];
    }
  }

  const normalizedFolders = new Set<string>();

  const normalizeFolder = (folderSourceId: string, ancestry: Set<string>): void => {
    if (normalizedFolders.has(folderSourceId)) {
      return;
    }

    const folderSource = folderSources[folderSourceId];
    if (!folderSource) {
      return;
    }

    ancestry.add(folderSourceId);

    const rawChildren = folderChildren[folderSourceId] ?? [];
    const validChildren: string[] = [];

    for (const childId of rawChildren) {
      const placement = placements[childId];
      if (!placement) {
        continue;
      }

      if (placement.type === 'strip-placement') {
        if (stripSources[placement.sourceId]) {
          validChildren.push(childId);
        }
        continue;
      }

      if (!folderSources[placement.sourceId]) {
        delete placements[childId];
        continue;
      }

      if (ancestry.has(placement.sourceId)) {
        delete placements[childId];
        continue;
      }

      normalizeFolder(placement.sourceId, ancestry);
      validChildren.push(childId);
    }

    folderChildren[folderSourceId] = validChildren;

    let requiredBodyTrackCount = 1;
    const finalizedIds: string[] = [];
    const orderedIds = [...validChildren].sort((leftId, rightId) => {
      const leftPlacement = placements[leftId];
      const rightPlacement = placements[rightId];
      if (!leftPlacement || !rightPlacement) {
        return leftId.localeCompare(rightId);
      }

      const leftPreferred = isPreferredPlacement(
        leftPlacement,
        preferredPlacementIds,
        preferredFolderSourceIds,
      );
      const rightPreferred = isPreferredPlacement(
        rightPlacement,
        preferredPlacementIds,
        preferredFolderSourceIds,
      );
      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1;
      }

      return comparePlacementsCanonical(leftPlacement, rightPlacement);
    });

    for (const placementId of orderedIds) {
      const placement = placements[placementId];
      if (!placement) {
        continue;
      }

      const rowSpan = getPlacementRowSpan(placement, folderSources);
      const rowEndExclusive = placement.startRow + rowSpan;
      requiredBodyTrackCount = Math.max(requiredBodyTrackCount, rowEndExclusive);

      placement.startTick = findResolvedStartTick(
        placement,
        finalizedIds,
        placements,
        folderSources,
      );
      finalizedIds.push(placementId);
    }

    folderSource.bodyTrackCount = Math.max(folderSource.bodyTrackCount, requiredBodyTrackCount, 1);
    folderChildren[folderSourceId] = [...validChildren].sort((leftId, rightId) => {
      const leftPlacement = placements[leftId];
      const rightPlacement = placements[rightId];
      if (!leftPlacement || !rightPlacement) {
        return leftId.localeCompare(rightId);
      }
      return comparePlacementsCanonical(leftPlacement, rightPlacement);
    });
    folderSource.childPlacementIds = [...folderChildren[folderSourceId]];

    ancestry.delete(folderSourceId);
    normalizedFolders.add(folderSourceId);
  };

  for (const folderSourceId of Object.keys(folderSources).sort()) {
    normalizeFolder(folderSourceId, new Set<string>());
  }

  for (const folderSource of Object.values(folderSources)) {
    folderSource.childPlacementIds = [...(folderChildren[folderSource.id] ?? [])];
  }

  return {
    root,
    stripSources,
    folderSources,
    folderChildren,
    placements,
  };
}

export function runTemporaryTimelineGc(snapshot: TimelineSnapshot): TimelineSnapshot {
  // TODO: incremental GC に置き換える
  // TODO: Yjs transaction 内で差分 GC できるようにする
  // TODO: 履歴保持や undo/redo との相性を評価する
  return markAndSweepTimelineSnapshot(snapshot);
}

export function markAndSweepTimelineSnapshot(snapshot: TimelineSnapshot): TimelineSnapshot {
  const normalized = normalizeTimelineSnapshot(snapshot);
  const reachableFolderSources = new Set<string>([normalized.root.rootFolderSourceId]);
  const reachableStripSources = new Set<string>();
  const reachablePlacements = new Set<string>();

  const walkFolder = (folderSourceId: string): void => {
    const folderSource = normalized.folderSources[folderSourceId];
    if (!folderSource) {
      return;
    }

    for (const placementId of folderSource.childPlacementIds) {
      if (reachablePlacements.has(placementId)) {
        continue;
      }

      const placement = normalized.placements[placementId];
      if (!placement) {
        continue;
      }

      reachablePlacements.add(placementId);

      if (placement.type === 'strip-placement') {
        reachableStripSources.add(placement.sourceId);
        continue;
      }

      reachableFolderSources.add(placement.sourceId);
      walkFolder(placement.sourceId);
    }
  };

  walkFolder(normalized.root.rootFolderSourceId);

  const stripSources = Object.fromEntries(
    Object.entries(normalized.stripSources).filter(([sourceId]) =>
      reachableStripSources.has(sourceId),
    ),
  );
  const folderSources = Object.fromEntries(
    Object.entries(normalized.folderSources).filter(([sourceId]) =>
      reachableFolderSources.has(sourceId),
    ),
  );
  const placements = Object.fromEntries(
    Object.entries(normalized.placements).filter(([placementId]) =>
      reachablePlacements.has(placementId),
    ),
  );
  const folderChildren = Object.fromEntries(
    Object.entries(normalized.folderChildren)
      .filter(([folderSourceId]) => reachableFolderSources.has(folderSourceId))
      .map(([folderSourceId, childPlacementIds]) => [
        folderSourceId,
        childPlacementIds.filter((placementId) => reachablePlacements.has(placementId)),
      ]),
  );

  for (const folderSource of Object.values(folderSources)) {
    folderSource.childPlacementIds = [...(folderChildren[folderSource.id] ?? [])];
  }

  return {
    root: normalized.root,
    stripSources,
    folderSources,
    folderChildren,
    placements,
  };
}

function sanitizeRoot(
  root: TimelineSnapshot['root'],
  folderSources: Record<string, FolderSource>,
  folderChildren: Record<string, string[]>,
): TimelineRoot {
  const rootFolderSourceId =
    typeof root?.rootFolderSourceId === 'string' && root.rootFolderSourceId.length > 0
      ? root.rootFolderSourceId
      : FALLBACK_ROOT_FOLDER_SOURCE_ID;

  if (!(rootFolderSourceId in folderSources)) {
    folderSources[rootFolderSourceId] = {
      id: rootFolderSourceId,
      type: 'folder-source',
      name: 'Root Timeline',
      bodyTrackCount: 1,
      childPlacementIds: [],
    };
  }

  folderChildren[rootFolderSourceId] = folderChildren[rootFolderSourceId] ?? [];

  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    rootFolderSourceId,
    timeScale: sanitizePositiveInteger(root?.timeScale, DEFAULT_TIME_SCALE),
    nextOrdinal: sanitizeNonNegativeInteger(root?.nextOrdinal, 0),
    normalizeVersion: TIMELINE_NORMALIZE_VERSION,
  };
}

function sanitizeStripSources(
  sources: TimelineSnapshot['stripSources'],
): Record<string, StripSource> {
  const normalized: Record<string, StripSource> = {};

  for (const [sourceId, rawSource] of Object.entries(sources ?? {})) {
    const id =
      typeof rawSource?.id === 'string' && rawSource.id.length > 0 ? rawSource.id : sourceId;
    const kind = STRIP_SOURCE_KINDS.has(rawSource?.kind) ? rawSource.kind : 'unknown';
    normalized[id] = {
      id,
      type: 'strip-source',
      kind,
      name:
        typeof rawSource?.name === 'string' && rawSource.name.length > 0
          ? rawSource.name
          : 'Untitled Strip',
      availableDurationTicks:
        rawSource?.availableDurationTicks === undefined
          ? undefined
          : sanitizePositiveInteger(rawSource.availableDurationTicks, 1),
      metadata: isRecord(rawSource?.metadata) ? { ...rawSource.metadata } : undefined,
    };
  }

  return normalized;
}

function sanitizeFolderSources(
  sources: TimelineSnapshot['folderSources'],
  folderChildren: Record<string, string[]>,
): Record<string, FolderSource> {
  const normalized: Record<string, FolderSource> = {};

  for (const [sourceId, rawSource] of Object.entries(sources ?? {})) {
    const id =
      typeof rawSource?.id === 'string' && rawSource.id.length > 0 ? rawSource.id : sourceId;
    normalized[id] = {
      id,
      type: 'folder-source',
      name:
        typeof rawSource?.name === 'string' && rawSource.name.length > 0
          ? rawSource.name
          : 'Untitled Folder',
      bodyTrackCount: sanitizePositiveInteger(rawSource?.bodyTrackCount, 1),
      childPlacementIds: deduplicateIds(folderChildren[id] ?? rawSource?.childPlacementIds ?? []),
    };
  }

  return normalized;
}

function sanitizeFolderChildren(
  folderChildren: TimelineSnapshot['folderChildren'],
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [folderSourceId, childPlacementIds] of Object.entries(folderChildren ?? {})) {
    normalized[folderSourceId] = deduplicateIds(childPlacementIds ?? []);
  }
  return normalized;
}

function sanitizePlacements(placements: TimelineSnapshot['placements']): Record<string, Placement> {
  const normalized: Record<string, Placement> = {};

  for (const [placementId, rawPlacement] of Object.entries(placements ?? {})) {
    const id =
      typeof rawPlacement?.id === 'string' && rawPlacement.id.length > 0
        ? rawPlacement.id
        : placementId;

    if (rawPlacement?.type === 'strip-placement') {
      if (typeof rawPlacement.sourceId !== 'string' || rawPlacement.sourceId.length === 0) {
        continue;
      }

      normalized[id] = {
        id,
        type: 'strip-placement',
        sourceId: rawPlacement.sourceId,
        sourceOffsetTicks: sanitizeNonNegativeInteger(rawPlacement.sourceOffsetTicks, 0),
        durationTicks: sanitizePositiveInteger(rawPlacement.durationTicks, 1),
        startTick: sanitizeNonNegativeInteger(rawPlacement.startTick, 0),
        startRow: sanitizeNonNegativeInteger(rawPlacement.startRow, 0),
        laneSpan: sanitizePositiveInteger(rawPlacement.laneSpan, 1),
        ordinal: sanitizeNonNegativeInteger(rawPlacement.ordinal, 0),
      };
      continue;
    }

    if (rawPlacement?.type === 'folder-placement') {
      if (typeof rawPlacement.sourceId !== 'string' || rawPlacement.sourceId.length === 0) {
        continue;
      }

      normalized[id] = {
        id,
        type: 'folder-placement',
        sourceId: rawPlacement.sourceId,
        durationTicks: sanitizePositiveInteger(rawPlacement.durationTicks, 1),
        startTick: sanitizeNonNegativeInteger(rawPlacement.startTick, 0),
        startRow: sanitizeNonNegativeInteger(rawPlacement.startRow, 0),
        ordinal: sanitizeNonNegativeInteger(rawPlacement.ordinal, 0),
      };
    }
  }

  return normalized;
}

function deduplicateIds(values: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      unique.add(value);
    }
  }
  return [...unique];
}

function isPreferredPlacement(
  placement: Placement,
  preferredPlacementIds: Set<string>,
  preferredFolderSourceIds: Set<string>,
): boolean {
  return (
    preferredPlacementIds.has(placement.id) ||
    (placement.type === 'folder-placement' && preferredFolderSourceIds.has(placement.sourceId))
  );
}

function comparePlacementsCanonical(left: Placement, right: Placement): number {
  return (
    left.startRow - right.startRow ||
    left.startTick - right.startTick ||
    left.ordinal - right.ordinal ||
    left.id.localeCompare(right.id)
  );
}

function getPlacementRowSpan(
  placement: Placement,
  folderSources: Record<string, FolderSource>,
): number {
  if (placement.type === 'strip-placement') {
    return placement.laneSpan;
  }

  return 1 + (folderSources[placement.sourceId]?.bodyTrackCount ?? 1);
}

function findResolvedStartTick(
  placement: Placement,
  finalizedIds: string[],
  placements: Record<string, Placement>,
  folderSources: Record<string, FolderSource>,
): number {
  let candidateStartTick = placement.startTick;
  let didMove = true;

  while (didMove) {
    didMove = false;
    for (const siblingId of finalizedIds) {
      const siblingPlacement = placements[siblingId];
      if (!siblingPlacement) {
        continue;
      }

      if (!rowsOverlap(placement, siblingPlacement, folderSources)) {
        continue;
      }

      const placementEndTick = candidateStartTick + placement.durationTicks;
      const siblingEndTick = siblingPlacement.startTick + siblingPlacement.durationTicks;
      const overlapsInTime =
        candidateStartTick < siblingEndTick && siblingPlacement.startTick < placementEndTick;
      if (!overlapsInTime) {
        continue;
      }

      candidateStartTick = siblingEndTick;
      didMove = true;
    }
  }

  return candidateStartTick;
}

function rowsOverlap(
  left: Placement,
  right: Placement,
  folderSources: Record<string, FolderSource>,
): boolean {
  const leftEndRow = left.startRow + getPlacementRowSpan(left, folderSources);
  const rightEndRow = right.startRow + getPlacementRowSpan(right, folderSources);
  return left.startRow < rightEndRow && right.startRow < leftEndRow;
}

function sanitizePositiveInteger(value: unknown, fallback: number): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
    return fallback;
  }
  return value;
}

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    return fallback;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
