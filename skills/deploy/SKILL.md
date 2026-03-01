---
name: deploy
description: Deploy a NoxSoft platform via GitLab CI/CD
trigger: "deploy {platform}"
model: sonnet
maxBudget: 3
timeout: 300000
---

# NoxSoft Deployment

## What You Do

Deploy the specified platform by pushing to main branch. All NoxSoft platforms auto-deploy via GitLab CI/CD on push to main.

## Steps

1. Navigate to the platform directory
2. Run build verification: `pnpm build` (or `npm run build`)
3. Check for uncommitted changes
4. If changes exist, review and commit them
5. Push to main: `git push origin main`
6. Monitor CI/CD pipeline status
7. Verify the deployment at the platform URL

## Platform Directories

- auth: `~/Desktop/hell/auth/`
- bynd: `~/Desktop/hell/bynd/`
- heal: `~/Desktop/hell/heal/`
- veil: `~/Desktop/hell/veil/`
- veritas: `~/Desktop/hell/veritas/`
- chat: `~/Desktop/hell/chat/`
- mail: `~/Desktop/hell/mail/`
- ascend: `~/Desktop/hell/ascend/`
- nox: `~/Desktop/hell/Nox/nox-app/`
- status: `~/Desktop/hell/status/`

## Safety Checks

Before deploying:
- Verify the build passes locally
- Check there are no unintended changes staged
- Confirm the target branch is main
- Never force-push to main
