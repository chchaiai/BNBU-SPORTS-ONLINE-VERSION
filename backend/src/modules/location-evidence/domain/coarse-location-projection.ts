import { ApplicationError } from '../../../common/errors/application-error.js';

const EARTH_RADIUS_METERS = 6_371_008.8;
const WEB_MERCATOR_RADIUS_METERS = 6_378_137;
const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;

export interface CoarseProjectionPoint {
  sampleId: string;
  observedAt: Date;
  latitude: number;
  longitude: number;
}

export type CoarseProjectionQualityFlag =
  | 'OUT_OF_ORDER'
  | 'ENDPOINTS_STRIPPED'
  | 'GRID_SNAPPED'
  | 'ADJACENT_DUPLICATES_COLLAPSED'
  | 'INSUFFICIENT_INTERIOR_POINTS'
  | 'DISTANCE_ROUNDED';

export interface CoarseLocationProjection {
  coarseRoute: string | null;
  coarseDistanceMeters: number;
  qualityFlags: readonly CoarseProjectionQualityFlag[];
}

interface GridCell {
  x: number;
  y: number;
}

function assertPoint(point: CoarseProjectionPoint): void {
  if (
    point.sampleId.length === 0 ||
    !Number.isFinite(point.observedAt.getTime()) ||
    !Number.isFinite(point.latitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    !Number.isFinite(point.longitude) ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }
}

function gridCell(point: CoarseProjectionPoint, gridMeters: number): GridCell {
  const latitude = Math.max(
    -MAX_WEB_MERCATOR_LATITUDE,
    Math.min(MAX_WEB_MERCATOR_LATITUDE, point.latitude),
  );
  const longitudeRadians = (point.longitude * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const xMeters = WEB_MERCATOR_RADIUS_METERS * longitudeRadians;
  const yMeters =
    WEB_MERCATOR_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
  return { x: Math.floor(xMeters / gridMeters), y: Math.floor(yMeters / gridMeters) };
}

function haversineMeters(left: CoarseProjectionPoint, right: CoarseProjectionPoint): number {
  const leftLatitude = (left.latitude * Math.PI) / 180;
  const rightLatitude = (right.latitude * Math.PI) / 180;
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function flagOrder(flag: CoarseProjectionQualityFlag): number {
  return [
    'OUT_OF_ORDER',
    'ENDPOINTS_STRIPPED',
    'GRID_SNAPPED',
    'ADJACENT_DUPLICATES_COLLAPSED',
    'INSUFFICIENT_INTERIOR_POINTS',
    'DISTANCE_ROUNDED',
  ].indexOf(flag);
}

/**
 * Produces a coarse grid-cell route, never a raw-coordinate polyline. Exact first
 * and last observations are removed before grid snapping. The encoding can only
 * recover approved grid cells, not the submitted points inside those cells.
 */
export function projectCoarseLocation(
  input: readonly CoarseProjectionPoint[],
  coarseProjectionMeters: number,
): CoarseLocationProjection {
  if (!Number.isSafeInteger(coarseProjectionMeters) || coarseProjectionMeters < 1) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_COARSE_PROJECTION_GRID_INVALID',
    });
  }
  for (const point of input) assertPoint(point);

  const flags = new Set<CoarseProjectionQualityFlag>();
  for (let index = 1; index < input.length; index += 1) {
    if (input[index]!.observedAt.getTime() < input[index - 1]!.observedAt.getTime()) {
      flags.add('OUT_OF_ORDER');
      break;
    }
  }

  const points = [...input].sort(
    (left, right) =>
      left.observedAt.getTime() - right.observedAt.getTime() ||
      left.sampleId.localeCompare(right.sampleId),
  );
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += haversineMeters(points[index - 1]!, points[index]!);
  }
  const coarseDistanceMeters = Math.max(
    0,
    Math.round(distance / coarseProjectionMeters) * coarseProjectionMeters,
  );
  if (points.length >= 2) flags.add('DISTANCE_ROUNDED');

  flags.add('ENDPOINTS_STRIPPED');
  const interior = points.length > 2 ? points.slice(1, -1) : [];
  const cells: GridCell[] = [];
  for (const point of interior) {
    const cell = gridCell(point, coarseProjectionMeters);
    const previous = cells.at(-1);
    if (previous?.x === cell.x && previous.y === cell.y) {
      flags.add('ADJACENT_DUPLICATES_COLLAPSED');
      continue;
    }
    cells.push(cell);
  }

  let coarseRoute: string | null = null;
  if (cells.length === 0) {
    flags.add('INSUFFICIENT_INTERIOR_POINTS');
  } else {
    flags.add('GRID_SNAPPED');
    coarseRoute = `CG1:${coarseProjectionMeters}:${cells
      .map((cell) => `${cell.x},${cell.y}`)
      .join(';')}`;
  }

  return {
    coarseRoute,
    coarseDistanceMeters,
    qualityFlags: [...flags].sort((left, right) => flagOrder(left) - flagOrder(right)),
  };
}
