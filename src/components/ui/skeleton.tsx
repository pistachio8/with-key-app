import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    variant: {
      card: "rounded-[14px] h-24 w-full",
      line: "h-3 rounded-full",
      avatar: "rounded-full size-10",
      block: "rounded-md",
    },
  },
  defaultVariants: { variant: "line" },
});

interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof skeletonVariants> {}

export function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cn(skeletonVariants({ variant }), className)} {...props} />
  );
}
