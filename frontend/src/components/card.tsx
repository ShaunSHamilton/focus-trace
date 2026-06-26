import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[#262626] bg-[#161616] p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
