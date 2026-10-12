import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function MobileBottomNav({ navigation }) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="lg:hidden shrink-0 flex items-stretch border-t border-[color:var(--border)] bg-[color:var(--surface)] pb-[env(safe-area-inset-bottom)]"
    >
      {navigation.map(({ name, href, icon: Icon }) => (
        <NavLink
          key={name}
          to={href}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              isActive ? "text-[color:var(--primary)]" : "text-[color:var(--foreground-muted)]"
            )
          }
        >
          <Icon className="h-5 w-5" />
          {name}
        </NavLink>
      ))}
    </nav>
  );
}