"use client";

// 디버깅용 개발자 로그인 모드 — web 숨긴 메뉴 (spec §5.3).
// login-screen 의 로고 5탭 제스처가 이 메뉴를 연다. 테스트 계정을 골라 즉시 로그인.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// 메뉴 노출 게이트. NEXT_PUBLIC_DEV_LOGIN === '1' 인 Preview env scope 에서만 true.
// Production 빌드는 이 값이 미설정이라 null 을 반환하고 dev 경로가 tree-shake 된다 (spec §4).
const DEV_LOGIN_VISIBLE = process.env.NEXT_PUBLIC_DEV_LOGIN === "1";

// 서버 allowlist(DEV_LOGIN_EMAILS env)와 정확히 같은 이메일 집합으로 맞춘다 (spec §5.5).
// 계정을 늘리면 env 와 이 목록을 함께 갱신한다 — .test 는 RFC 6761 예약 TLD.
const DEV_ACCOUNTS = [
  { label: "멤버·진행중", email: "member-active@fromwith.test" },
  { label: "잔액 있음", email: "balance@fromwith.test" },
] as const;

interface DevLoginMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DevLoginMenu({ open, onOpenChange }: DevLoginMenuProps) {
  if (!DEV_LOGIN_VISIBLE) return null;

  function pick(email: string) {
    // 브라우저 navigation — 서버(/auth/dev-login)가 쿠키를 set 하고 /home 으로 redirect.
    // window.location 이동이라 "useEffect+fetch 쓰기 금지" · Server Action 일원화 가드레일 대상 아님.
    // assign() 메서드 호출로 한다 (href= 할당은 react-hooks/immutability 가 외부 변수 수정으로 오인).
    window.location.assign(`/auth/dev-login?email=${encodeURIComponent(email)}&next=/home`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>개발자 로그인</DialogTitle>
          <DialogDescription>
            테스트 계정을 골라 즉시 로그인해요. dev 빌드에서만 보여요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {DEV_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              variant="outline"
              className="h-12 w-full justify-start gap-2"
              onClick={() => pick(account.email)}
            >
              <span className="font-semibold">{account.label}</span>
              <span className="text-muted-foreground text-xs">{account.email}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
