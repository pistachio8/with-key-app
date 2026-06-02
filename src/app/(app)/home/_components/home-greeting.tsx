// 모킹업 §2 — `5월 14일 · 화요일` (KST) + `안녕, {nickname} 👋`.
// RSC. 날짜는 서버에서 KST 자정 기준으로 포맷팅 (Intl, ko-KR · Asia/Seoul).

type Props = {
  displayName: string;
  /** 테스트/스토리북에서 시점을 고정하기 위한 옵셔널 주입. 기본은 `new Date()`. */
  now?: Date;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "long",
});

export function HomeGreeting({ displayName, now }: Props) {
  const parts = DATE_FORMATTER.formatToParts(now ?? new Date());
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dateLabel = `${month} ${day}일 · ${weekday}`;
  return (
    <section className="flex flex-col gap-0.5">
      <p className="t-sub">{dateLabel}</p>
      <h1 className="t-h1">
        안녕, {displayName} <span aria-hidden="true">👋</span>
      </h1>
    </section>
  );
}
