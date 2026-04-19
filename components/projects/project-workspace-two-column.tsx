"use client";

import type { ReactNode } from "react";

type ProjectWorkspaceTwoColumnProps = {
  leftTop: ReactNode;
  leftMiddle: ReactNode;
  leftBottom: ReactNode;
  rightTop: ReactNode;
  rightMiddle: ReactNode;
  rightBottom?: ReactNode;
};

export function ProjectWorkspaceTwoColumn({
  leftTop,
  leftMiddle,
  leftBottom,
  rightTop,
  rightMiddle,
  rightBottom,
}: ProjectWorkspaceTwoColumnProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        {leftTop}
        {leftMiddle}
        {leftBottom}
      </div>
      <div className="space-y-6">
        {rightTop}
        {rightMiddle}
        {rightBottom ?? null}
      </div>
    </div>
  );
}
