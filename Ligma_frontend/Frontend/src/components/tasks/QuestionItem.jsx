import { memo } from "react";
import { motion } from "motion/react";
import { CircleHelp } from "lucide-react";
import { MemberAvatar } from "./MemberSelector";
import { TypeSelector } from "./TypeSelector";
import { format, isValid } from "date-fns";

// ── Open question card (AI category "Question") ──────────────────────────────
export const QuestionItem = memo(function QuestionItem({
  task,
  members = [],
  onChangeType,
}) {
  const assignee = members.find(
    (m) => m.userId === task.assigneeId || m.id === task.assigneeId
  );

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const hasDue  = dueDate && isValid(dueDate);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="group flex items-start gap-3 px-4 py-3 border-b border-[color:var(--border)] hover:bg-[color:var(--bg-surface)] transition-colors"
    >
      {/* Icon */}
      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[color:var(--success-soft)] flex items-center justify-center">
        <CircleHelp className="w-3 h-3 text-[color:var(--success)]" />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-primary)] leading-5 truncate">
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs text-[color:var(--text-secondary)] leading-relaxed line-clamp-2">
            {task.description}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onChangeType && !String(task.id).endsWith("__ref") && (
          <TypeSelector compact value={task.type || "Question"} onChange={(nextType) => onChangeType(task.id, nextType)} />
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasDue && (
          <span className="text-[10px] text-[color:var(--text-secondary)] bg-[color:var(--bg-primary)] px-1.5 py-0.5 rounded border border-[color:var(--border)]">
            {format(dueDate, "M/d/yy")}
          </span>
        )}
        {assignee && <MemberAvatar member={assignee} size="sm" />}
      </div>
    </motion.div>
  );
});

export default QuestionItem;