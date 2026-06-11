# @withkey/mobile

Expo Managed + CNG shell for the fromwith RN migration.

## Commands

```bash
pnpm --filter @withkey/mobile start
pnpm --filter @withkey/mobile typecheck
pnpm --filter @withkey/mobile lint
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile expo config --type public
```

`APP_VARIANT` controls native identifiers and link domains:

- `dev` -> `app.fromwith.dev`, `fromwith-dev`, `dev.fromwith.app`
- `staging` -> `app.fromwith.staging`, `fromwith-staging`, `staging.fromwith.app`
- `prod` -> `app.fromwith`, `fromwith`, `fromwith.app`

Generated `ios/` and `android/` directories are CNG output and must stay untracked.
