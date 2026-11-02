import { Badge } from './ui/badge';
import type { LessonStatus, ModuleStatus } from '../lib/types';

export function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  switch (status) {
    case 'Do':
      return <Badge variant="now">Do</Badge>;
    case 'Review':
      return <Badge variant="warn">Review</Badge>;
    case 'Done':
      return <Badge variant="accent">✓ Done</Badge>;
    case 'Skip':
      return <Badge variant="muted">Skip</Badge>;
  }
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  switch (status) {
    case 'done':
      return <Badge variant="accent">✓ Done</Badge>;
    case 'in_progress':
      return <Badge variant="now">In progress</Badge>;
    case 'not_started':
      return <Badge variant="outline">Not started</Badge>;
  }
}
