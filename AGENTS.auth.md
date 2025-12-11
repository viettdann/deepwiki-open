# AGENTS.auth.md

Authentication and authorization system for DeepWiki.

## Overview

DeepWiki implements a complete JWT-based authentication system with role-based access control (admin/readonly users). The system uses HttpOnly cookies for secure session management and provides a Terminal Codex-themed login interface.

## Quick Start

### 1. Enable Authentication

Add to your `.env`:
```env
DEEPWIKI_AUTH_LOGIN_REQUIRED=true
DEEPWIKI_AUTH_STORE_PATH=api/config/users.json
DEEPWIKI_AUTH_JWT_SECRET=your-super-secret-key-min-32-chars-long-please
DEEPWIKI_FRONTEND_API_KEY=your-api-key-here
```

### 2. Default Credentials

Users are configured in `api/config/users.json`:

| Username | Password | Role | Access |
|----------|----------|------|--------|
| `admin` | `admin` | admin | Full access to all operations |
| `reader` | `reader` | readonly | View-only, disabled admin buttons |

### 3. Start Services

```bash
# Terminal 1: Backend
cd api
source .venv/bin/activate
uv run python -m api.main

# Terminal 2: Frontend
yarn dev
```

### 4. Test Login

1. Visit http://localhost:3000
2. You'll be redirected to the Terminal Codex login page
3. Login with `admin`/`admin` or `reader`/`reader`

## Architecture

### Authentication Flow

```
1. Login Flow

User → Login Page → POST /api/auth/login
↓
Next.js Route Handler → Backend POST /auth/login
↓
Backend validates credentials → Returns JWT (with ver field)
↓
Next.js sets HttpOnly cookie (dw_token, 30 days)
↓
Client AuthContext updates → User authenticated
└─────────────────────────────────────────────────────────────┘

2. Authenticated Request Flow

User makes request → Next.js reads dw_token cookie
↓
Proxy adds Authorization: Bearer <token> header
↓
Backend receives request → FastAPI extracts JWT from:
   • Cookie (dw_token) - Priority 1
   • Authorization header - Priority 2
↓
Backend validates JWT (signature, expiration, version)
↓
Backend returns user → Request processed
```

### Backend Components

1. **User Store Service** (`api/auth/user_store.py`)
   - JSON-backed user authentication
   - Per-worker mtime-based hot reloading
   - PBKDF2-SHA256 password verification (600,000 iterations)
   - Token version field support for invalidation

2. **JWT Service & Dependencies** (`api/auth/dependencies.py`)
   - JWT token generation (30-day expiration)
   - Token version field (`ver`) included in JWT payload
   - Token validation and decoding with version checking
   - Cookie-based JWT extraction (primary for browsers)
   - Authorization header extraction (fallback for CLI/API)

3. **Auth Endpoints** (`api/api.py`)
   - `POST /auth/login` - User authentication with JWT token
   - `POST /auth/logout` - Returns 204 No Content (stateless)
   - `GET /auth/me` - Current user info from JWT
   - `GET /auth/login-required` - Check if login enforced

### Frontend Components

1. **API Proxy Utility** (`src/lib/api-proxy.ts`)
   - Consolidates fetch logic with JWT + API key handling
   - Reads `dw_token` cookie automatically
   - Adds Authorization Bearer header to backend requests

2. **Next.js Middleware** (`src/middleware.ts`)
   - Server-side auth resolution using cookies
   - Redirects to `/login` if unauthenticated

3. **Auth Context** (`src/contexts/AuthContext.tsx`)
   - Client-side auth state management
   - Syncs from server on mount (server is source of truth)
   - Methods: `login()`, `logout()`, `refetch()`

4. **Login Page** (`src/app/login/page.tsx`)
   - Terminal Codex themed UI
   - Purple/cyan color scheme with monospace fonts
   - Traffic light dots, scan-line effects, grid background

## Password Hashing

The system uses **PBKDF2** password hashing with Python's standard library only:

```bash
# Generate new password hash
source api/.venv/bin/activate
python api/scripts/generate_password_hash.py MySecurePassword123
```

Format: `pbkdf2:sha256:600000$salt$hash`

## Role-Based Access Control

### API Endpoint Protection

Use FastAPI dependencies:

```python
from api.auth.dependencies import get_current_user, require_admin, require_auth, optional_auth

# Admin-only endpoint
@router.post("/jobs", dependencies=[Depends(require_admin)])
async def create_job():
    pass

# Any authenticated user
@router.get("/jobs", dependencies=[Depends(require_auth)])
async def list_jobs():
    pass

# Optional authentication
@router.get("/public", dependencies=[Depends(optional_auth)])
async def public_endpoint(user: User = None):
    pass
```

### Permission Matrix

| Operation | Admin | Readonly |
|-----------|:-----:|:--------:|
| Create wiki job | ✅ | ❌ |
| Delete wiki/job | ✅ | ❌ |
| Cancel/pause job | ✅ | ❌ |
| View wikis/jobs | ✅ | ✅ |
| View chat | ✅ | ✅ |
| Export wiki | ✅ | ✅ |

## Security Features

1. **HttpOnly Cookies**: JWT stored in HttpOnly cookie, not accessible via JavaScript
2. **Secure Flag**: Enabled in production (HTTPS only)
3. **SameSite=Lax**: CSRF protection
4. **PBKDF2 Password Hashing**: 600,000 iterations (OWASP 2023 recommendation)
5. **Backend Authority**: Frontend reflects backend state, no client-side security
6. **Token Versioning**: Invalidate tokens by incrementing version in users.json

## Token Invalidation

To invalidate all existing tokens for a user:

1. Edit `api/config/users.json`
2. Increment the `token_version` field for that user
3. Save the file (hot-reload will detect the change)

Example:
```json
{
  "id": "...",
  "username": "admin",
  "token_version": 2,  // Increment this
  ...
}
```

## Disable Authentication

Set in `.env`:
```env
DEEPWIKI_AUTH_LOGIN_REQUIRED=false
```

Everyone gets full admin access (no login required).

## Testing

```bash
# Test admin login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'

# Test reader login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "reader", "password": "reader"}'

# Test protected endpoint
curl -H "Authorization: Bearer <token>" http://localhost:8001/auth/me
```

## Files

**Backend:**
- `api/auth/user_store.py` - User store service
- `api/auth/dependencies.py` - JWT service and FastAPI dependencies
- `api/config/users.json` - User credentials

**Frontend:**
- `src/lib/api-proxy.ts` - API proxy with JWT handling
- `src/middleware.ts` - Next.js auth middleware
- `src/contexts/AuthContext.tsx` - React auth context
- `src/contexts/PermissionContext.tsx` - Permission context for role-based UI
- `src/app/login/page.tsx` - Login page
- `src/components/RoleBasedButton.tsx` - Role-based button component
- `src/components/PermissionDeniedModal.tsx` - Terminal Codex permission modal

## Role-Based UI Components

### Overview

The authentication system includes a comprehensive role-based UI implementation that provides elegant permission handling for admin/readonly users. The system uses a beautiful Terminal Codex themed permission modal for access-denied scenarios.

### Core Components

#### 1. RoleBasedButton Component (`src/components/RoleBasedButton.tsx`)

A reusable button component that automatically handles permission checks:
- **Admin users**: Action executes normally on click
- **Readonly users**: Beautiful permission denied modal is shown
- **No login required mode**: All users treated as admin

```typescript
interface RoleBasedButtonProps {
  onAdminClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  actionDescription: string;  // e.g., "pause job", "delete project"
  requireAdmin?: boolean;     // Default: true
  children: React.ReactNode;
  ...buttonProps              // All standard HTML button attributes
}
```

**Example Usage**:
```tsx
<RoleBasedButton
  onAdminClick={handlePause}
  actionDescription="pause job"
  className="btn-primary"
>
  <FaPause /> Pause
</RoleBasedButton>
```

#### 2. useRoleBasedAction Hook

For non-button elements that need permission handling:

```typescript
const { handleAction, modal, hasPermission } = useRoleBasedAction({
  onAdminAction: handleDelete,
  actionDescription: "delete project"
});

// Usage
<div onClick={handleAction}>Delete</div>
{modal}
```

#### 3. PermissionDeniedModal Component

Stunning Terminal Codex-styled modal (`src/components/PermissionDeniedModal.tsx`):
- Purple/cyan color scheme matching AGENTS.themes.md
- Traffic light dots (red, orange, green)
- Monospace fonts and terminal aesthetics
- Scan-line effects and grid background
- Smooth animations and glow effects
- Terminal-style output showing user role and required permissions

### Permission Flow

User Clicks Button

RoleBasedButton checks:
1. Is login required?
   • No → Execute action (treat as admin)
   • Yes → Continue to step 2

2. What is user role?
   • Admin → Execute action
   • Readonly → Show PermissionDeniedModal
   • Not authenticated → Show PermissionDeniedModal

### Protected UI Elements

The following components use `RoleBasedButton` for admin-only actions:

| Component | Protected Actions |
|-----------|------------------|
| `JobsClient.tsx` | Pause, Resume, Cancel jobs; Generate new job |
| `HomeClient.tsx` | Generate Wiki buttons (header & form) |
| `ProjectsClient.tsx` | Generate button |
| `Job Detail Page` | Pause, Resume, Cancel, Retry, Delete jobs/pages |
| `ProcessedProjects.tsx` | Delete project buttons |
| `RepoWikiClient.tsx` | REFRESH wiki button |
| `Workshop Page` | Regenerate Workshop button |
| `Slides Page` | Regenerate Slides button |

**Total**: 21 admin actions protected across 8 components

### Modal Appearance

When a readonly user clicks a protected button, they see a terminal-styled permission denied modal with:
- System error theme (`system/auth/deny.sh`)
- Error code display (403_FORBIDDEN)
- Terminal command showing attempted action
- User role and required role information
- Contact administrator message

### Theme Alignment

The implementation perfectly matches **AGENTS.themes.md** specifications:
- ✅ Purple/cyan color scheme (`#8b5cf6`, `#06b6d4`)
- ✅ Monospace fonts (JetBrains Mono)
- ✅ Traffic light dots for visual interest
- ✅ Terminal window styling
- ✅ Scan-line effects (subtle animation)
- ✅ Grid pattern backgrounds
- ✅ Terminal command output style
- ✅ Glow and shadow effects

### Testing

**With `DEEPWIKI_AUTH_LOGIN_REQUIRED=false`**:
- All buttons work normally for all users
- No permission modals shown
- All admin actions execute successfully

**With `DEEPWIKI_AUTH_LOGIN_REQUIRED=true` as Admin**:
- All buttons work normally
- No permission modals shown
- Full access to all admin operations

**With `DEEPWIKI_AUTH_LOGIN_REQUIRED=true` as Readonly**:
- Clicking admin buttons shows permission modal
- Modal displays correct action description
- No admin actions execute
- View-only functionality (viewing, exporting) remains available
