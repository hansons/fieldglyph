import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripSiteChrome } from '../../src/enrich/siteChromeCleanup.ts';

test('stripSiteChrome: strips the ad script + donation banner, keeps real content', () => {
  const raw =
    'Woodway Bridge, nr All Cannings, Wiltshire. Reported 24th August. Wheat. c.80 feet diameter (24m). ' +
    'A small circle with increasingly large spirals expanding outwards. ' +
    'Make a donation to keep the web site alive FOR VISITING THE CROP CIRCLES. ' +
    '<!-- google_ad_client = "pub-1063779204083539"; /* 300x250, created 5/21/10 */ google_ad_slot = "6619874373"; google_ad_width = 300; google_ad_height = 250; //-->';
  const cleaned = stripSiteChrome(raw);
  assert.equal(
    cleaned,
    'Woodway Bridge, nr All Cannings, Wiltshire. Reported 24th August. Wheat. c.80 feet diameter (24m). ' +
      'A small circle with increasingly large spirals expanding outwards.',
  );
});

test('stripSiteChrome: real content sandwiched between two junk fragments survives', () => {
  // The site's banner is split by its own template into two halves that can
  // land on either side of the real report text in document order.
  const raw =
    'THE FIELD HAS BEEN HARVESTED. Etchilhampton, Nr Devizes, Wiltshire. Reported 8th August. ' +
    'Make a donation to keep the web site alive Wheat. c.89 feet (24m). ' +
    'Small ringed circle with flattened centre containing tiny twisted standing crop off centre. ' +
    'FOR VISITING THE CROP CIRCLES. ' +
    '<!-- google_ad_client = "pub-1063779204083539"; //-->';
  const cleaned = stripSiteChrome(raw);
  assert.ok(cleaned?.includes('Wheat. c.89 feet (24m).'));
  assert.ok(cleaned?.includes('Small ringed circle with flattened centre'));
  assert.ok(!cleaned?.includes('donation'));
  assert.ok(!cleaned?.includes('google_ad'));
  assert.ok(!cleaned?.includes('FOR VISITING'));
});

test('stripSiteChrome: the "FOR VISITING" half can lead, with real content after it', () => {
  const raw =
    'FOR VISITING THE CROP CIRCLES. Paul Jacobs. (CGI) Ackling Dyke, Nr Sixpenny Handley, Dorset. ' +
    'Reported 4th June. Police notified. Make a donation to keep the web site alive ' +
    '<!-- google_ad_client = "pub-1063779204083539"; //-->';
  const cleaned = stripSiteChrome(raw);
  assert.equal(cleaned, 'Paul Jacobs. (CGI) Ackling Dyke, Nr Sixpenny Handley, Dorset. Reported 4th June. Police notified.');
});

test('stripSiteChrome: "... Thank you" variant of the donation banner', () => {
  assert.equal(
    stripSiteChrome('Lurkeley Hill, nr East Kennett, Wiltshire. Reported 3rd August. Make a donation to keep the web site alive... Thank you'),
    'Lurkeley Hill, nr East Kennett, Wiltshire. Reported 3rd August.',
  );
});

test('stripSiteChrome: page-nav tabs with trailing sub-page dates and a "GO TO PAGE" lead-in', () => {
  const raw =
    'Viex Lixheim, nr Sarrebourg, Moselle, France. Reported 18th June. ' +
    'AERIAL SHOTS Video GROUND SHOTS DIAGRAMS FIELD REPORTS COMMENTS ARTICLES 21/06/17 20/06/17 20/06/17 ' +
    'Google Translate:- Umberto Molinaro';
  assert.equal(
    stripSiteChrome(raw),
    'Viex Lixheim, nr Sarrebourg, Moselle, France. Reported 18th June. Google Translate:- Umberto Molinaro',
  );

  const withGoTo =
    'Wayland Smithy formation. Joseph in Miami GO TO PAGE 2 AERIAL SHOTS GROUND SHOTS DIAGRAMS FIELD REPORTS ARTICLES';
  assert.equal(stripSiteChrome(withGoTo), 'Wayland Smithy formation. Joseph in Miami');

  assert.equal(
    stripSiteChrome('Some report text. GO TO PAGE TWO AERIAL SHOTS GROUND SHOTS DIAGRAMS FIELD REPORTS'),
    'Some report text.',
  );
});

test('stripSiteChrome: a description that is entirely chrome collapses to null', () => {
  assert.equal(
    stripSiteChrome(
      'Make a donation to keep the web site alive <!-- google_ad_client = "pub-1063779204083539"; //-->',
    ),
    null,
  );
});

test('stripSiteChrome: unaffected descriptions pass through unchanged', () => {
  const raw = 'A perfectly ordinary field report with no site chrome in it at all.';
  assert.equal(stripSiteChrome(raw), raw);
});

test('stripSiteChrome: Facebook-discuss and DVD-membership plugs (found in copyright_notice)', () => {
  const raw =
    "IMAGES STONEHENGE DRONESCAPES PHOTOGRAPHY COPYRIGHT 2024 Discuss this circle on our Facebook Crop Circles-UFO's-Ancient Mysteries-Scientific Speculations " +
    'Images Hugh Newman Copyright 2024 All Rights Reserved CLICK HERE FOR THE LATEST CROP CIRCLE CONNECTOR DVD ' +
    'Make a donation to keep the web site alive';
  const cleaned = stripSiteChrome(raw);
  assert.equal(
    cleaned,
    'IMAGES STONEHENGE DRONESCAPES PHOTOGRAPHY COPYRIGHT 2024 Images Hugh Newman Copyright 2024 All Rights Reserved',
  );
});

test('stripSiteChrome: a hard-truncated donation banner at the very end is trimmed', () => {
  // Real observed values, truncated mid-word by the parser at different points.
  assert.equal(
    stripSiteChrome(
      'IMAGES STONEHENGE DRONESCAPES PHOTOGRAPHY COPYRIGHT 2024 Images Hugh Newman Copyright 2024 All Rights Reserved Make a donation to keep the web site ali',
    ),
    'IMAGES STONEHENGE DRONESCAPES PHOTOGRAPHY COPYRIGHT 2024 Images Hugh Newman Copyright 2024 All Rights Reserved',
  );
  assert.equal(
    stripSiteChrome('Images The Hampshire Flyer Copyright 2020 Images Neil Petherick Copyright 2020 Make a donation to keep the web'),
    'Images The Hampshire Flyer Copyright 2020 Images Neil Petherick Copyright 2020',
  );
  assert.equal(
    stripSiteChrome(
      'IMAGES The Hampshire Flyer COPYRIGHT 2021 CLICK HERE FOR THE LATEST CROP CIRCLE CONN',
    ),
    'IMAGES The Hampshire Flyer COPYRIGHT 2021',
  );
});

test('stripSiteChrome: a real multi-photographer copyright_notice keeps every credit', () => {
  const raw =
    'Images Lucy Pringle Copyright 2015 <!-- google_ad_client = "pub-1063779204083539"; ' +
    '/* 300x250, created 5/21/10 */ google_ad_slot = "6619874373"; google_ad_width = 300; google_ad_height = 250; //-->';
  assert.equal(stripSiteChrome(raw), 'Images Lucy Pringle Copyright 2015');
});
