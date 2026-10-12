import React from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Lock,
  MousePointer2,
  Minus,
  Settings2,
  Square,
  StickyNote,
  Triangle,
  Type,
  Unlock,
} from "lucide-react";

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "sticky", label: "Sticky", icon: StickyNote },
  { id: "text", label: "Text", icon: Type },
  { id: "rectangle", label: "Rect", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "diamond", label: "Diamond", icon: Diamond },
  { id: "triangle", label: "Triangle", icon: Triangle },
  { id: "line", label: "Line", icon: Minus },
];

function CanvasToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  canEdit,
  selectedNode,
  isLead,
  onToggleLock,
  onOpenPermissions,
}) {
  const tools = canEdit ? TOOLS : TOOLS.filter((tool) => tool.id === "select");

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-2 md:top-4 z-20
        flex flex-row items-center gap-1.5 flex-nowrap
        rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]
        px-1.5 py-1 md:px-2 md:py-1.5 shadow-[var(--shadow-md)] backdrop-blur-sm
        max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-hidden no-scrollbar"
      style={{ touchAction: "pan-x" }}
    >
      {/* Tool buttons — hamesha horizontal row */}
      <div className="flex flex-row flex-nowrap items-center gap-0.5 shrink-0">
        {tools.map(({ id, label, icon: Icon }) => {
          const isActive = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToolChange(id)}
              title={label}
              aria-label={label}
              aria-pressed={isActive}
              className={[
                "relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5",
                "w-10 h-10 md:w-11 md:h-11 rounded-lg text-[10px] font-medium transition-all duration-150",
                isActive
                  ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--foreground)]",
              ].join(" ")}
            >
              <Icon
                className={`w-4 h-4 ${isActive ? "stroke-[2.2]" : "stroke-[1.8]"}`}
              />
              <span className="text-[8px] md:text-[9px] leading-none opacity-80">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lock + Permissions (Lead + selected node) */}
      {selectedNode && isLead && (
        <div className="flex flex-row flex-nowrap items-center gap-1 shrink-0 border-l border-[color:var(--border)] pl-2">
          <button
            type="button"
            onClick={onToggleLock}
            title={selectedNode.locked ? "Unlock node" : "Lock node"}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[color:var(--border)] px-2 py-1.5 text-[11px] font-medium whitespace-nowrap text-[color:var(--foreground-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--foreground)] transition-colors"
          >
            {selectedNode.locked ? (
              <Unlock className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {selectedNode.locked ? "Unlock" : "Lock"}
          </button>
          <button
            type="button"
            onClick={onOpenPermissions}
            title="Edit permissions"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[color:var(--border)] px-2 py-1.5 text-[11px] font-medium whitespace-nowrap text-[color:var(--foreground-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--foreground)] transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Perms
          </button>
        </div>
      )}
    </div>
  );
}
export default React.memo(CanvasToolbar);