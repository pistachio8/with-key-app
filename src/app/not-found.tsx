import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
};

export default function NotFound() {
  return (
    <main
      id="main"
      className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col items-center justify-center px-6"
    >
      <EmptyState
        icon={Compass}
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 사라진 페이지예요."
        action={
          <Link href="/home" className={cn(buttonVariants({ size: "lg" }), "h-11 px-6")}>
            홈으로 가기
          </Link>
        }
      />
    </main>
  );
}
