---
name: review
description: Code review with NoxSoft quality standards
trigger: "review {path}"
model: opus
maxBudget: 10
timeout: 900000
---

# Code Review

## What You Do

Review the code at the specified path against NoxSoft quality standards.

## Checklist

1. **Security**: No exec/execSync (use execFile), no SQL injection, no XSS, no hardcoded secrets
2. **Architecture**: Follows existing patterns, proper separation of concerns
3. **TypeScript**: Proper types (no `any`), exported interfaces
4. **Error handling**: Graceful failures, informative error messages
5. **Performance**: No obvious bottlenecks, efficient queries
6. **Testing**: Tests exist and cover core behavior
7. **NoxSoft standards**: Dark theme, proper branding, SSO integration

## Review Format

```
# Code Review: {path}

## Summary
One paragraph overview of what this code does and its overall quality.

## Security
- [ ] No shell injection (execFile, not exec)
- [ ] No SQL injection
- [ ] No XSS vectors
- [ ] No hardcoded secrets
- [ ] Proper input validation

## Architecture
- [ ] Follows existing patterns
- [ ] Proper separation of concerns
- [ ] Clean module boundaries

## TypeScript
- [ ] No `any` types
- [ ] Exported interfaces for public API
- [ ] Proper generics where applicable

## Issues Found
1. [severity: critical/major/minor] File:Line — Description
2. [severity: critical/major/minor] File:Line — Description

## Recommendations
- Suggestion 1
- Suggestion 2
```
