import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const SettingsBlockTitle = ({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) => (
  <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
    <Icon size={15} className="shrink-0 text-[var(--color-primary)]" />
    {children}
  </h3>
);
