import * as React from "react";

import { cn } from "@/lib/utils";

// Input 과 동일한 시각 토큰 + h-11 SoT (`text-base md:text-sm` 으로 iOS Safari focus
// 자동 zoom 회피 + 데스크탑 14px 응축). multi-row 가 필요한 호출처에서는 className
// 으로 `min-h-*` override.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-11 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
