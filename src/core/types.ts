import type { Logger } from './logger.ts';
import type { RawCache } from './cache.ts';
import type { WaybackClient } from './wayback.ts';
import type { RobotsGate } from './robots.ts';

export type FetchMode = 'live' | 'wayback';
export type FetchPolicy = 'live' | 'wayback' | 'live-then-wayback';

export interface SourcePage {
  url: string;
  pageType: 'index' | 'detail' | 'asset';
}

export interface FetchResult {
  url: string;
  html: string;
  httpStatus: number;
  fetchMode: FetchMode;
  waybackTimestamp?: string;
  waybackUrl?: string;
  fetchedAt: string;
  cachePath: string;
}

export type DatePrecision = 'day' | 'month' | 'year' | 'unknown';
export type DiscoveryVsWitnessed = 'discovered' | 'witnessed' | 'unknown';
export type CoordinateSource =
  | 'source_provided'
  | 'os_grid_converted'
  | 'region_centroid'
  | 'unknown';
export type LocationPrecision = 'exact' | 'approximate' | 'place-name-only';
export type VerificationStatus =
  | 'reported'
  | 'investigated-no-anomaly'
  | 'investigated-bio-anomaly'
  | 'hoax-admitted'
  | 'hoax-suspected'
  | 'unresolved';

export interface ParsedMedia {
  url: string;
  kind: 'photo' | 'video' | 'diagram' | 'other';
  caption?: string;
  copyrightNotice?: string;
  photographer?: string;
  license?: string;
  isAerial?: boolean;
}

export interface ParsedFormation {
  externalId?: string;
  title?: string;
  description?: string;
  reportedBy?: string;

  discoveredDate?: string;
  discoveredDatePrecision?: DatePrecision;
  timeObserved?: string;
  discoveryVsWitnessed?: DiscoveryVsWitnessed;

  locationName?: string;
  country?: string;
  adminRegion?: string;
  latitude?: number;
  longitude?: number;
  coordinateSource?: CoordinateSource;
  locationPrecision?: LocationPrecision;
  osGridRef?: string;

  cropType?: string;
  formationType?: string;
  formationTypeTags?: string[];
  diameterMeters?: number;
  verificationStatus?: VerificationStatus;
  anomalyNotes?: string;

  media: ParsedMedia[];
  parseWarnings?: string[];
}

export interface HttpClient {
  fetchPage(
    url: string,
    policy: FetchPolicy,
    opts?: { forceRefetch?: boolean },
  ): Promise<FetchResult>;
}

export interface ConnectorContext {
  http: HttpClient;
  wayback: WaybackClient;
  cache: RawCache;
  robots: RobotsGate;
  logger: Logger;
}

export interface Connector {
  readonly id: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly defaultFetchMode: FetchPolicy;
  readonly parserVersion: string;

  discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage>;
  parsePage(fetchResult: FetchResult, page: SourcePage): ParsedFormation[];
}
