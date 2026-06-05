import { cn } from "@/lib/utils";

interface ShareCardProps {
  brand?: string;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  className?: string;
}

export function ShareCard({
  brand = "FROM. WITH",
  title,
  subtitle,
  footer,
  className,
}: ShareCardProps) {
  return (
    <div
      className={cn(
        "rounded-[18px] p-4 text-primary-foreground",
        "bg-[linear-gradient(135deg,#8AA4FF_0%,#BCA6FF_50%,#FFB6C6_100%)]",
        className,
      )}
    >
      <div className="text-[11px] font-bold tracking-[0.05em] opacity-95">{brand}</div>
      <div className="mt-6 text-lg font-bold leading-tight">{title}</div>
      {subtitle && <div className="mt-1 text-xs opacity-90">{subtitle}</div>}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
