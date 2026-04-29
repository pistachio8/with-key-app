// (auth) 그룹 (/login, /invite) 은 자체적으로 unauthenticated 접근이 정상이므로
// guard/shell 없이 children 만 통과. 존재 자체가 Next.js type validator 요구사항 충족용.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
