import type { ReactNode } from "react";

export function Page({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  );
}
