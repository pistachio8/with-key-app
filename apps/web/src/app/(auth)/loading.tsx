import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 min-h-svh">
      <Skeleton variant="avatar" />
      <Skeleton variant="line" className="w-40" />
      <Skeleton variant="line" className="w-56" />
    </div>
  );
}
