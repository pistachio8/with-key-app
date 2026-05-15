import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const cardVariants = cva(
  "rounded-[14px] border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(20,24,36,0.04)]",
  {
    variants: {
      padding: { none: "p-0", sm: "p-2.5", md: "p-3.5", lg: "p-5" },
      tone: {
        default: "",
        muted: "bg-muted/60 border-transparent shadow-none",
        primary: "bg-primary text-primary-foreground border-transparent",
      },
    },
    defaultVariants: { padding: "md", tone: "default" },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, padding, tone, ...props }: CardProps) {
  return <div className={cn(cardVariants({ padding, tone }), className)} {...props} />;
}
