import type { Connector, ConnectorContext, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { parseIrcupFeed } from './parse.ts';

const BASE_URL = 'http://ccdb.cropcircleresearch.com';

// The only URL this connector targets. Investigation (2026-07-28) found that
// ccdb.cropcircleresearch.com — the "International Crop Circle Database" — was
// login/paywall-gated even while live: the root page, every search-listing URL, and
// every individual record permalink (?d=<id>) all resolve, in every Wayback snapshot
// checked, to the same anonymous "Sign On" wall, never the underlying formation data.
// Wayback's crawler was never authenticated, so it never captured the real content.
// The one exception is this RSS feed, which was not behind the login gate (RSS feeds
// commonly aren't, for syndication) and has exactly one surviving snapshot containing
// 7 real, structured formation records. That is the entire recoverable dataset for
// this source — not a bug in this connector, a fact about what Wayback was able to see.
const FEED_URL = `${BASE_URL}/index.rss`;

async function* discoverPages(_ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  yield { url: FEED_URL, pageType: 'detail' };
}

export const connector: Connector = {
  id: 'ircup',
  displayName: 'IRCUP International Crop Circle Database',
  baseUrl: BASE_URL,
  defaultFetchMode: 'wayback',
  parserVersion: '1.0.0',
  discoverPages,
  parsePage: parseIrcupFeed,
};

export const sourceDef: SourceDef = {
  key: 'ircup',
  name: 'IRCUP International Crop Circle Database',
  baseUrl: BASE_URL,
  status: 'dead',
  recoveryPriority: 2,
  notes:
    'Founded 1993 by Paul Vigay (died 2009); cropcircleresearch.com and the ccdb subdomain no ' +
    'longer resolve at all (DNS failure), confirmed 2026-07-28. The database itself required a ' +
    'paid/guest login even while live — every Wayback snapshot of every search and record URL ' +
    'shows only the sign-on wall, never real content, so the ~587 record IDs found in Wayback\'s ' +
    'CDX index are not recoverable. Only one snapshot (2014-08-13) of the site\'s RSS feed escaped ' +
    'the login gate, yielding 7 genuine formation records — that is this connector\'s full recovery.',
};
