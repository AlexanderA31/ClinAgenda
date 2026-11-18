import { CalendarClock, CheckCircle2, UserX, XCircle } from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '@clinagenda/schemas';
import { Badge } from '@/components/ui/badge';

const STYLE = {
  SCHEDULED: { tone: 'info', Icon: CalendarClock },
  ATTENDED: { tone: 'good', Icon: CheckCircle2 },
  NO_SHOW: { tone: 'warn', Icon: UserX },
  CANCELLED: { tone: 'danger', Icon: XCircle },
} as const;

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { tone, Icon } = STYLE[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden /> {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
