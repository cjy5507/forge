# Code Rules: {{PROJECT_NAME}}

> Defined by Forge CTO | Date: {{DATE}}
> Framework: {{FRAMEWORK}} | Verified via context7: Yes
> 
> ALL developers MUST follow these rules. Violations = PR REJECTED.

---

## 1. Naming Conventions

| Target | Convention | Example |
|--------|-----------|---------|
| Variables | camelCase | `userName`, `isActive` |
| Functions | camelCase | `fetchUser()`, `handleSubmit()` |
| Components | PascalCase | `LoginForm`, `UserCard` |
| Files (components) | PascalCase | `LoginForm.tsx` |
| Files (utilities) | camelCase | `formatDate.ts` |
| CSS classes | {{CONVENTION}} | {{EXAMPLE}} |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Types/Interfaces | PascalCase, prefix I for interfaces | `UserProfile`, `IAuthService` |

## 2. Folder Structure

{{CTO defines project-specific structure here}}

## 3. Error Handling

**Pattern:** {{try-catch | Result type | Error boundaries}}

Good:
{{example}}

Bad:
{{example}}

## 4. State Management

**Library:** {{zustand | redux | jotai | etc.}}
**Pattern:** {{store per feature | single global store | etc.}}

## 5. API Patterns

**Data fetching:** {{server components | route handlers | server actions}}
**Pattern:**

## 6. CSS/Styling

**Approach:** {{tailwind | CSS modules | styled-components}}
**Conventions:**

## 7. Import Ordering

1. External packages (react, next, etc.)
2. Internal aliases (@/)
3. Relative imports
4. Styles
5. Types (type-only imports last)

## 8. Component Structure

**Pattern:**
1. Imports
2. Types/Interfaces
3. Component function
4. Hooks
5. Handlers
6. Return JSX
7. Export
