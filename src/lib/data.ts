/**
 * Static dataset assembly. v1 reads committed JSON from /data — the same
 * shape the future Jira sync script (Route 3) will emit.
 */
import featuresJson from '../../data/features.json';
import milestonesJson from '../../data/milestones.json';
import issuesJson from '../../data/issues.json';
import historyJson from '../../data/status_history.json';
import type { Feature, Issue, Milestone, StatusTransition } from './types';
import { computeIssueMetrics, indexHistory, type HistoryIndex } from './metrics';
import { MOCK_TODAY } from './config';

export interface Dataset {
  features: Feature[];
  milestones: Milestone[]; // sorted by due_date
  issues: Issue[];
  history: StatusTransition[];
  historyByIssue: HistoryIndex;
  metrics: ReturnType<typeof computeIssueMetrics>;
  issueByKey: Map<string, Issue>;
  categories: string[]; // stable order of first appearance in features.json
  featuresByCategory: Map<string, Feature[]>;
  epicsByFeature: Map<string, Issue[]>;
  childrenByEpic: Map<string, Issue[]>; // countable children (Stories+Bugs)
  subtasksByStory: Map<string, Issue[]>;
  today: Date;
}

export function buildDataset(
  features: Feature[],
  milestones: Milestone[],
  issues: Issue[],
  history: StatusTransition[],
  today: Date,
): Dataset {
  const historyByIssue = indexHistory(history);
  const metrics = computeIssueMetrics(issues, historyByIssue, today);
  const issueByKey = new Map(issues.map((i) => [i.issue_key, i]));

  const categories: string[] = [];
  const featuresByCategory = new Map<string, Feature[]>();
  for (const f of features) {
    if (!featuresByCategory.has(f.category)) {
      featuresByCategory.set(f.category, []);
      categories.push(f.category);
    }
    featuresByCategory.get(f.category)!.push(f);
  }

  const epicsByFeature = new Map<string, Issue[]>();
  const childrenByEpic = new Map<string, Issue[]>();
  const subtasksByStory = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.issue_type === 'Epic') {
      if (!epicsByFeature.has(i.feature_id)) epicsByFeature.set(i.feature_id, []);
      epicsByFeature.get(i.feature_id)!.push(i);
    } else if (i.issue_type === 'Subtask') {
      if (i.parent_key) {
        if (!subtasksByStory.has(i.parent_key)) subtasksByStory.set(i.parent_key, []);
        subtasksByStory.get(i.parent_key)!.push(i);
      }
    } else if (i.epic_key) {
      if (!childrenByEpic.has(i.epic_key)) childrenByEpic.set(i.epic_key, []);
      childrenByEpic.get(i.epic_key)!.push(i);
    }
  }

  return {
    features,
    milestones: [...milestones].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    issues,
    history,
    historyByIssue,
    metrics,
    issueByKey,
    categories,
    featuresByCategory,
    epicsByFeature,
    childrenByEpic,
    subtasksByStory,
    today,
  };
}

/** Default milestone selection: nearest future due_date (spec P2). */
export function currentMilestone(milestones: Milestone[], today: Date): Milestone {
  const future = milestones.filter((m) => Date.parse(m.due_date) >= today.getTime());
  return future[0] ?? milestones[milestones.length - 1];
}

export const dataset: Dataset = buildDataset(
  featuresJson as Feature[],
  milestonesJson as Milestone[],
  issuesJson as Issue[],
  historyJson as StatusTransition[],
  MOCK_TODAY,
);
