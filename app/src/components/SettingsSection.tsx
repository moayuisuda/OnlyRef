import { useId, type ReactNode } from "react";

export const SettingsSection = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => {
  const titleId = useId();

  return (
    <section aria-labelledby={title ? titleId : undefined}>
      {title && (
        <h3 id={titleId} className="mb-2 px-1 text-[11px] font-medium text-neutral-400">
          {title}
        </h3>
      )}
      <div className="divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-neutral-800">
        {children}
      </div>
    </section>
  );
};
