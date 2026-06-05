// src/app/(app)/challenge/[id]/recap/_components/photo-gallery.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { RecapPhotoView } from "@/lib/db/reads/challenge-photos";

type Props = { photos: ReadonlyArray<RecapPhotoView> };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function PhotoGallery({ photos }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (photos.length === 0) return null;
  const active = activeId ? (photos.find((p) => p.id === activeId) ?? null) : null;

  return (
    <section aria-label="챌린지 인증 사진" className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-2">
      <ul className="grid grid-cols-3 gap-[3px]">
        {photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-label={`사진 보기 — ${p.ownerDisplayName}`}
              onClick={() => setActiveId(p.id)}
              className="relative block aspect-square w-full overflow-hidden rounded-[3px]"
            >
              <Image
                src={p.signedUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 33vw, 200px"
                loading="lazy"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="max-w-screen-sm p-0">
          {active && (
            <figure className="flex flex-col">
              <div className="relative aspect-square w-full bg-black">
                <Image
                  src={active.signedUrl}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              </div>
              <figcaption className="px-4 py-3 text-sm">
                <span className="font-semibold">{active.ownerDisplayName}</span>
                <span className="ml-2 text-[var(--invite-muted,#5E4838)]">
                  {fmtDate(active.takenAt)}
                </span>
              </figcaption>
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
