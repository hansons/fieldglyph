// Lightweight reviewer identity: no accounts, just a name/handle a person types
// once, persisted in the browser. Enforced server-side (a submitter can't also
// validate their own submission) — this module only needs to surface a name to
// send with each review-API call, not authenticate anyone.

const KEY = 'cca-reviewer';

export function peekReviewerName() {
  return localStorage.getItem(KEY);
}

export function getReviewerName() {
  let name = localStorage.getItem(KEY);
  if (!name) {
    name = (prompt('Reviewing as? (a name or handle — shown to other reviewers, no account needed)') ?? '').trim();
    if (name) localStorage.setItem(KEY, name);
  }
  return name || null;
}

export function changeReviewerName() {
  const name = (prompt('Change reviewer name to:', localStorage.getItem(KEY) ?? '') ?? '').trim();
  if (name) localStorage.setItem(KEY, name);
  return localStorage.getItem(KEY);
}
