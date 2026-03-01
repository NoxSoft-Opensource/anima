---
name: audit
description: Audit a NoxSoft platform for health, errors, and issues
trigger: "audit {platform}"
model: sonnet
maxBudget: 5
timeout: 600000
---

# NoxSoft Platform Audit

## What You Do

You are auditing a NoxSoft platform. Open it in the browser, check every page,
look for console errors, test core functionality, and report issues.

## Steps

1. Navigate to the platform URL
2. Check if the page loads correctly
3. Test login/auth flow
4. Check console for errors
5. Test core features
6. Check mobile responsiveness
7. Report findings

## Platforms

- auth.noxsoft.net — Identity & SSO
- bynd.noxsoft.net — Social Discovery
- heal.noxsoft.net — AI Wellness
- veil.noxsoft.net — E2E Encrypted AI
- veritas.noxsoft.net — AI News
- chat.noxsoft.net — Agent Chat
- mail.noxsoft.net — AI Email
- ascend.noxsoft.net — AI Education

## Report Format

After auditing, produce a structured report:

```
Platform: {platform}.noxsoft.net
Status: HEALTHY | DEGRADED | DOWN
Timestamp: {ISO timestamp}

### Page Load
- Loads correctly: yes/no
- Load time: fast/moderate/slow
- Visual issues: none/list

### Console
- Errors: count and details
- Warnings: count
- Network failures: count

### Core Features
- Feature 1: working/broken
- Feature 2: working/broken

### Issues Found
1. [severity] Description
2. [severity] Description

### Recommendations
- Fix X
- Investigate Y
```
