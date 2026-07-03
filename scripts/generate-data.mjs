/**
 * Deterministic sample-data generator for the Delivery Readiness Dashboard.
 *
 * Produces /data/{features,milestones,issues,status_history}.json matching the
 * ontology in docs/dashboard-requirements-spec-2026-07.md §1 plus amendment A1
 * (scope_disposition) from the code handoff brief.
 *
 * Grain rules enforced here (and re-checked in validate()):
 *  - Epics: milestone_id / epic_key / parent_key NULL; disposition NOT NULL
 *    iff is_scope_overflow_inherited is TRUE.
 *  - Stories/Bugs: parent_key = epic_key = their epic; milestone_id set.
 *  - Subtasks: parent_key = story, epic_key = story's epic, milestone NULL.
 *  - is_scope_overflow_inherited copied from the epic to all descendants,
 *    exactly as the future sync job would do.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(Number(process.env.SEED ?? 17));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

const DAY = 86400000;
const TODAY = Date.UTC(2026, 6, 3, 10, 30); // mocked "now": 2026-07-03T10:30Z
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const dateBetween = (a, b) => a + rnd() * (b - a);
const D = (y, m, d) => Date.UTC(y, m - 1, d);

// ---------------------------------------------------------------- dimensions
// Milestone names/dates from the prototype (build-progress-milestones.html):
// internal demo → OEM acceptance → field trial. M4 (launch readiness) is
// added because the handoff requires 4 milestones spanning 2026-07 → 2027-01.
// start_date = previous milestone's due_date (spec §1.1 default), M1 explicit.
const milestones = [
  { milestone_id: 'M1', name: 'M1 · internal demo',   start_date: '2026-05-04', due_date: '2026-07-24', expected_curve: 'linear' },
  { milestone_id: 'M2', name: 'M2 · OEM acceptance',  start_date: '2026-07-24', due_date: '2026-09-11', expected_curve: 'linear' },
  { milestone_id: 'M3', name: 'M3 · field trial',     start_date: '2026-09-11', due_date: '2026-11-06', expected_curve: 'linear' },
  { milestone_id: 'M4', name: 'M4 · launch readiness', start_date: '2026-11-06', due_date: '2027-01-29', expected_curve: 'linear' },
];

const features = [
  { feature_id: 'F-OTA-001', feature_name: 'OTA Updates',           category: 'OTA',            product_concept_id: null },
  { feature_id: 'F-OTA-002', feature_name: 'Delta Sync',            category: 'OTA',            product_concept_id: null },
  { feature_id: 'F-DK-001',  feature_name: 'Phone as Key',          category: 'Digital Key',    product_concept_id: null },
  { feature_id: 'F-DK-002',  feature_name: 'Key Sharing',           category: 'Digital Key',    product_concept_id: null },
  { feature_id: 'F-DK-003',  feature_name: 'NFC Card Key',          category: 'Digital Key',    product_concept_id: null },
  { feature_id: 'F-RC-001',  feature_name: 'Climate Control',       category: 'Remote Command', product_concept_id: null },
  { feature_id: 'F-RC-002',  feature_name: 'Remote Lock/Unlock',    category: 'Remote Command', product_concept_id: null },
  { feature_id: 'F-RC-003',  feature_name: 'Vehicle Status Monitor',category: 'Remote Command', product_concept_id: null },
  { feature_id: 'F-RP-001',  feature_name: 'Remote Smart Parking',  category: 'Remote Parking', product_concept_id: null },
  { feature_id: 'F-RP-002',  feature_name: 'Parking Assist View',   category: 'Remote Parking', product_concept_id: null },
];
const featById = Object.fromEntries(features.map((f) => [f.feature_id, f]));

// Epic definitions: [key, name, feature, +scope flag, disposition, item mix]
// mix = array of [milestone_id, storyCount] (bugs carved from the count below)
const epicDefs = [
  ['OTA-100', 'OTA Backend Services',      'F-OTA-001', true,  'undecided', [['M1', 5], ['M2', 3]]],
  ['OTA-200', 'OTA Campaign Manager',      'F-OTA-001', false, null,        [['M1', 7], ['M2', 4]]],
  ['OTA-300', 'Delta Sync Engine',         'F-OTA-002', false, null,        [['M1', 6], ['M2', 4]]],
  ['OTA-400', 'Package Diff Tooling',      'F-OTA-002', false, null,        [['M2', 5], ['M3', 4]]],
  ['DK-100',  'BLE Pairing & Security',    'F-DK-001',  true,  'formalize', [['M1', 4], ['M2', 3]]],
  ['DK-200',  'Key Provisioning',          'F-DK-001',  false, null,        [['M1', 8], ['M2', 3]]],
  ['DK-300',  'Key Share Service',         'F-DK-002',  false, null,        [['M1', 6], ['M2', 4]]],
  ['DK-400',  'Share Invitations UX',      'F-DK-002',  false, null,        [['M2', 5], ['M3', 3]]],
  ['DK-500',  'NFC Applet Integration',    'F-DK-003',  false, null,        [['M3', 6], ['M4', 3]]],
  ['RC-100',  'Climate Command Core',      'F-RC-001',  false, null,        [['M1', 7], ['M2', 3]]],
  ['RC-200',  'Scheduled Climate',         'F-RC-001',  false, null,        [['M2', 4], ['M3', 3]]],
  // RC-300 ships fully done so the strict "delivered" rule shows a yes (7th flag)
  ['RC-300',  'Lock/Unlock Core',          'F-RC-002',  false, null,        [['M1', 8], ['M2', 2]], true],
  ['RC-400',  'Telemetry Pipeline',        'F-RC-003',  true,  'absorb',    [['M2', 4], ['M3', 3]]],
  ['RC-500',  'Status Dashboard Widgets',  'F-RC-003',  false, null,        [['M3', 5], ['M4', 4]]],
  ['RP-100',  'Parking Control',           'F-RP-001',  false, null,        [['M1', 6], ['M2', 3]]],
  ['RP-200',  'Remote Parking UI',         'F-RP-001',  true,  'undecided', [['M1', 3], ['M2', 4]]],
  ['RP-300',  'Path Planning Integration', 'F-RP-001',  false, null,        [['M3', 4], ['M4', 4]]],
  ['RP-400',  'Surround View Streaming',   'F-RP-002',  false, null,        [['M3', 2], ['M4', 5]]],
];

// -------------------------------------------------- status machinery
// Workflow states, verbatim (spec §1.2): new, dev ready, in dev, dev blocked,
// in review, qa ready, qa active, qa blocked, qa pass.
const CHAIN = ['new', 'dev ready', 'in dev', 'in review', 'qa ready', 'qa active', 'qa pass'];
function pathTo(status) {
  if (status === 'dev blocked') return [...CHAIN.slice(0, 3), 'dev blocked'];
  if (status === 'qa blocked') return [...CHAIN.slice(0, 6), 'qa blocked'];
  return CHAIN.slice(0, CHAIN.indexOf(status) + 1);
}

// Per-milestone current-status weights (realistic spread; M1 nearly done,
// M4 barely started).
const STATUS_WEIGHTS = {
  M1: [['qa pass', 72], ['qa active', 5], ['qa blocked', 2], ['qa ready', 4], ['in review', 5], ['in dev', 6], ['dev blocked', 3], ['dev ready', 2], ['new', 1]],
  M2: [['qa pass', 38], ['qa active', 7], ['qa blocked', 2], ['qa ready', 5], ['in review', 8], ['in dev', 21], ['dev blocked', 3], ['dev ready', 8], ['new', 8]],
  M3: [['qa pass', 12], ['qa active', 2], ['qa ready', 2], ['in review', 4], ['in dev', 18], ['dev blocked', 2], ['dev ready', 20], ['new', 40]],
  M4: [['qa pass', 6], ['in dev', 9], ['dev ready', 15], ['new', 70]],
};
const CREATED_WINDOW = {
  M1: [D(2026, 4, 6), D(2026, 5, 10)],
  M2: [D(2026, 5, 1), D(2026, 6, 10)],
  M3: [D(2026, 6, 1), D(2026, 7, 1)],
  M4: [D(2026, 6, 15), D(2026, 7, 1)],
};

const issues = [];
const history = [];

// NOTE: `summary` is NOT in the spec §1.2 schema — it is a native Jira field
// added so the prototyped UI (P1 blocked list, P3 accordion, P6 epic rows)
// can show human-readable titles. Surfaced as an open question in
// data/README.md rather than silently assumed.
const rndName = mulberry32(11); // separate stream: naming must not perturb the status distribution
const pickName = (arr) => arr[Math.floor(rndName() * arr.length)];
const rndSub = mulberry32(7); // separate stream for subtask generation
const pickSub = (arr) => arr[Math.floor(rndSub() * arr.length)];
const VERBS = ['Implement', 'Refactor', 'Fix', 'Add', 'Harden', 'Validate', 'Instrument', 'Migrate', 'Optimize', 'Document'];
const NOUNS = ['session handshake', 'retry logic', 'token refresh', 'error surface', 'pairing flow', 'telemetry batching',
  'push channel', 'offline cache', 'permission prompts', 'rollback path', 'state machine', 'API contract',
  'progress events', 'deep link routing', 'certificate pinning', 'rate limiting', 'metrics emitter', 'edge timeouts'];
const summaryFor = (type) => `${type === 'Bug' ? 'Fix' : pickName(VERBS)} ${pickName(NOUNS)}`;

function addHistory(key, statuses, createdAt, finalAt, rng = rnd) {
  // creation event + one transition per subsequent status, strictly increasing
  const times = [createdAt];
  const inner = statuses.length - 1;
  for (let i = 1; i <= inner; i++) {
    times.push(i === inner ? finalAt : createdAt + rng() * (finalAt - createdAt));
  }
  const tail = times.slice(1).sort((a, b) => a - b);
  const all = [times[0], ...tail];
  for (let i = 1; i < all.length; i++) {
    if (all[i] <= all[i - 1]) all[i] = all[i - 1] + 3600000; // nudge 1h
  }
  statuses.forEach((s, i) => {
    history.push({
      issue_key: key,
      from_status: i === 0 ? null : statuses[i - 1],
      to_status: s,
      changed_at: iso(all[i]),
    });
  });
  return all[all.length - 1];
}

let seq = 0;
for (const [epicKey, epicName, featureId, flagged, disposition, mix, forceDone] of epicDefs) {
  const feat = featById[featureId];
  const prefix = epicKey.split('-')[0];
  const children = [];

  for (const [mid, count] of mix) {
    for (let i = 0; i < count; i++) {
      seq += 1;
      const key = `${prefix}-${500 + seq}`;
      const issueType = rnd() < 0.2 ? 'Bug' : 'Story';
      let status = weighted(STATUS_WEIGHTS[mid]); // draw even when overridden — keeps the PRNG stream stable
      if (forceDone) status = 'qa pass';
      const [c0, c1] = CREATED_WINDOW[mid];
      const createdAt = dateBetween(c0, c1);
      const statuses = pathTo(status);

      let finalAt;
      if (status === 'dev blocked' || status === 'qa blocked') {
        finalAt = TODAY - Math.floor(1 + rnd() * 14) * DAY; // blocked 1–14 days
      } else if (status === 'qa pass') {
        finalAt = dateBetween(Math.max(createdAt + 5 * DAY, D(2026, 5, 15)), TODAY - DAY);
      } else if (status === 'new') {
        finalAt = createdAt;
      } else {
        // a share of long-idle rows so the "stalled > 14d" list has content
        finalAt = rnd() < 0.25
          ? dateBetween(createdAt + DAY, Math.max(createdAt + 2 * DAY, TODAY - 15 * DAY))
          : dateBetween(Math.max(createdAt + DAY, TODAY - 14 * DAY), TODAY - DAY);
      }
      if (finalAt <= createdAt) finalAt = createdAt + DAY;

      const updatedAt = addHistory(key, statuses, createdAt, finalAt);
      issues.push({
        issue_key: key,
        issue_type: issueType,
        summary: summaryFor(issueType),
        status,
        category: feat.category,
        feature_id: featureId,
        epic_key: epicKey,
        parent_key: epicKey,
        milestone_id: mid,
        is_scope_overflow_inherited: flagged,
        scope_disposition: null,
        created_at: iso(createdAt),
        updated_at: iso(updatedAt),
      });
      children.push({ key, status, mid, createdAt });
    }
  }

  // Subtasks: only under Stories in M1/M2, milestone NULL, flag inherited.
  // Separate PRNG stream so subtask generation never perturbs the Story/Bug
  // status distribution (invariant 1 depends on subtasks being pure add-ons).
  for (const ch of children) {
    const parent = issues.find((x) => x.issue_key === ch.key);
    if (parent.issue_type !== 'Story' || !['M1', 'M2'].includes(ch.mid)) continue;
    if (rndSub() > 0.45) continue;
    const n = 1 + Math.floor(rndSub() * 3);
    for (let s = 0; s < n; s++) {
      seq += 1;
      const key = `${prefix}-${500 + seq}`;
      const status = ch.status === 'qa pass' ? 'qa pass' : pickSub(['new', 'in dev', 'in dev', 'qa pass']);
      const createdAt = ch.createdAt + DAY;
      const finalAt = status === 'new' ? createdAt : createdAt + DAY + rndSub() * (TODAY - 2 * DAY - createdAt);
      const updatedAt = addHistory(key, pathTo(status), createdAt, Math.max(finalAt, createdAt + DAY), rndSub);
      issues.push({
        issue_key: key,
        issue_type: 'Subtask',
        summary: pickName(['Implementation', 'Unit tests', 'Code review fixes', 'Design sync', 'QA notes']),
        status,
        category: feat.category,
        feature_id: featureId,
        epic_key: epicKey,
        parent_key: ch.key,
        milestone_id: null,
        is_scope_overflow_inherited: flagged,
        scope_disposition: null,
        created_at: iso(createdAt),
        updated_at: iso(updatedAt),
      });
    }
  }

  // Epic row itself (never countable, never sliced)
  const allDone = children.every((c) => c.status === 'qa pass');
  const epicCreated = Math.min(...children.map((c) => c.createdAt)) - 7 * DAY;
  const epicStatus = allDone ? 'qa pass' : 'in dev';
  const epicUpdated = addHistory(epicKey, pathTo(epicStatus), epicCreated, epicCreated + 5 * DAY, rndSub);
  issues.push({
    issue_key: epicKey,
    issue_type: 'Epic',
    summary: epicName,
    status: epicStatus,
    category: feat.category,
    feature_id: featureId,
    epic_key: null,
    parent_key: null,
    milestone_id: null,
    is_scope_overflow_inherited: flagged,
    scope_disposition: flagged ? disposition : null,
    created_at: iso(epicCreated),
    updated_at: iso(epicUpdated),
  });
}

// ---------------------------------------------------------------- validate
function fail(msg) { throw new Error(`data validation failed: ${msg}`); }
function validate() {
  const byKey = Object.fromEntries(issues.map((i) => [i.issue_key, i]));
  for (const i of issues) {
    if (i.issue_type === 'Epic') {
      if (i.milestone_id !== null || i.epic_key !== null || i.parent_key !== null)
        fail(`epic ${i.issue_key} has non-NULL milestone/epic/parent`);
      if (i.is_scope_overflow_inherited && i.scope_disposition === null)
        fail(`flagged epic ${i.issue_key} missing disposition (A1 rule 3)`);
      if (!i.is_scope_overflow_inherited && i.scope_disposition !== null)
        fail(`unflagged epic ${i.issue_key} carries disposition`);
    } else {
      if (i.scope_disposition !== null) fail(`non-epic ${i.issue_key} carries disposition (A1 rule 1)`);
      const epic = byKey[i.epic_key];
      if (!epic || epic.issue_type !== 'Epic') fail(`${i.issue_key} has bad epic_key`);
      if (i.is_scope_overflow_inherited !== epic.is_scope_overflow_inherited)
        fail(`${i.issue_key} flag differs from its epic (inheritance)`);
      if (i.issue_type === 'Subtask') {
        if (i.milestone_id !== null) fail(`subtask ${i.issue_key} has milestone`);
        if (byKey[i.parent_key]?.issue_type !== 'Story') fail(`subtask ${i.issue_key} parent not a Story`);
      } else {
        if (i.milestone_id === null) fail(`${i.issue_key} (Story/Bug) missing milestone`);
        if (i.parent_key !== i.epic_key) fail(`${i.issue_key} parent_key != epic_key`);
      }
    }
  }
  // history integrity: first row creation, last row matches status, increasing
  const byIssue = new Map();
  for (const h of history) {
    if (!byIssue.has(h.issue_key)) byIssue.set(h.issue_key, []);
    byIssue.get(h.issue_key).push(h);
  }
  for (const i of issues) {
    const rows = byIssue.get(i.issue_key) ?? [];
    if (rows.length === 0) fail(`${i.issue_key} has no history`);
    if (rows[0].from_status !== null) fail(`${i.issue_key} first row not creation`);
    if (rows[rows.length - 1].to_status !== i.status) fail(`${i.issue_key} history tail != status`);
    for (let k = 1; k < rows.length; k++) {
      if (rows[k].changed_at <= rows[k - 1].changed_at) fail(`${i.issue_key} non-increasing history`);
    }
  }
}
validate();

history.sort((a, b) => (a.issue_key < b.issue_key ? -1 : a.issue_key > b.issue_key ? 1 : a.changed_at < b.changed_at ? -1 : 1));

writeFileSync(join(OUT, 'features.json'), JSON.stringify(features, null, 2) + '\n');
writeFileSync(join(OUT, 'milestones.json'), JSON.stringify(milestones, null, 2) + '\n');
writeFileSync(join(OUT, 'issues.json'), JSON.stringify(issues, null, 2) + '\n');
writeFileSync(join(OUT, 'status_history.json'), JSON.stringify(history, null, 2) + '\n');

const cnt = (t) => issues.filter((i) => i.issue_type === t).length;
const blocked = issues.filter((i) => ['dev blocked', 'qa blocked'].includes(i.status) && i.issue_type !== 'Subtask' && i.issue_type !== 'Epic').length;
const done = issues.filter((i) => ['Story', 'Bug'].includes(i.issue_type) && i.status === 'qa pass').length;
const total = cnt('Story') + cnt('Bug');
console.log(`epics=${cnt('Epic')} stories=${cnt('Story')} bugs=${cnt('Bug')} subtasks=${cnt('Subtask')}`);
console.log(`countable=${total} done=${done} (${Math.round((100 * done) / total)}%) blocked=${blocked} history_rows=${history.length}`);
