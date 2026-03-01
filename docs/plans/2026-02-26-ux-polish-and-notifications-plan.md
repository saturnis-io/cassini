# UX Polish, Notification Fixes & Account Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix toast UX, repair broken notification paths, restructure settings, add forgot-password flow, and add self-service account management.

**Architecture:** Six independent workstreams converging into a single migration (039). Backend fixes for notification event bus gaps and severity filtering. Frontend splits NotificationsSettings into two pages. New ForgotPassword and AccountSettings pages with email verification flow. All identity-change actions audit-logged.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, React 19, TypeScript 5.9, TanStack Query v5, Zustand, sonner, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-02-26-ux-polish-and-notifications-design.md`

---

## Wave 1: Quick Fixes (Independent, Parallelizable)

### Task 1: Toast Close Button CSS Fix

**Files:**
- Modify: `frontend/src/index.css` (append after line 948)

**Step 1: Add toast close button CSS overrides**

Append to `frontend/src/index.css`:

```css
/* ========== Sonner Toast Overrides ========== */
[data-sonner-toast] [data-close-button] {
  position: absolute !important;
  top: 6px !important;
  right: 6px !important;
  left: auto !important;
  transform: none !important;
  border: 1px solid var(--border) !important;
  background: var(--background) !important;
  color: var(--muted-foreground) !important;
  opacity: 0.6;
  transition: opacity 0.15s;
}

[data-sonner-toast] [data-close-button]:hover {
  opacity: 1;
  background: var(--muted) !important;
}

[data-sonner-toast] {
  padding-right: 2rem !important;
}
```

**Step 2: Verify visually**

Run: `cd frontend && npm run dev`
Trigger a toast (e.g., save a setting) and verify the X stays pinned inside the toast on hover.

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: pin sonner toast close button inside toast on hover"
```

---

### Task 2: Attribute Engine Event Bus Fix (BLOCKER)

**Files:**
- Modify: `backend/src/cassini/core/engine/attribute_engine.py` (lines 24, 864, 1050-1063)

**Step 1: Add ViolationCreatedEvent import**

At top of `attribute_engine.py`, after line 24 (`from cassini.core.explain import ExplanationCollector`), add:

```python
from cassini.core.events.events import ViolationCreatedEvent
from cassini.core.events.bus import event_bus as global_event_bus
```

**Step 2: Add event_bus parameter to process_attribute_sample**

Find the function signature for `process_attribute_sample()` (around line 864). Add `event_bus=None` parameter:

```python
async def process_attribute_sample(
    ...,
    event_bus=None,
):
```

**Step 3: Publish ViolationCreatedEvent after each violation**

Inside the violation creation loop (lines 1050-1063), after `violations.append(result)` (line 1062), add:

```python
    violations.append(result)

    # Publish event for notification dispatch
    bus = event_bus or global_event_bus
    if bus:
        await bus.publish(ViolationCreatedEvent(
            violation_id=violation_record.id,
            sample_id=sample.id,
            characteristic_id=char_id,
            rule_id=result.rule_id,
            rule_name=result.rule_name,
            severity=result.severity,
        ))
```

**Step 4: Verify backend starts**

Run: `cd backend && python -c "from cassini.core.engine.attribute_engine import process_attribute_sample; print('OK')"`

**Step 5: Commit**

```bash
git add backend/src/cassini/core/engine/attribute_engine.py
git commit -m "fix: publish ViolationCreatedEvent from attribute engine for notifications"
```

---

### Task 3: Fix SMTP Username Encrypted Blob Bug

**Files:**
- Modify: `backend/src/cassini/api/v1/notifications.py` (line 58)
- Modify: `backend/src/cassini/api/schemas/notification.py` (SmtpConfigResponse)

**Step 1: Update SmtpConfigResponse schema**

In `backend/src/cassini/api/schemas/notification.py`, find `SmtpConfigResponse`. Change the `username` field:

```python
class SmtpConfigResponse(BaseModel):
    id: int
    server: str
    port: int
    username_set: bool   # Changed from username: Optional[str]
    password_set: bool
    use_tls: bool
    from_address: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
```

**Step 2: Update GET endpoint to use boolean flag**

In `backend/src/cassini/api/v1/notifications.py`, line 58. Change:

```python
    return SmtpConfigResponse(
        id=config.id,
        server=config.server,
        port=config.port,
        username_set=config.username is not None and config.username != "",
        password_set=config.password is not None and config.password != "",
        use_tls=config.use_tls,
        from_address=config.from_address,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )
```

**Step 3: Update frontend SmtpSection to match**

Find SmtpSection in `NotificationsSettings.tsx` (or the new `EmailWebhookSettings.tsx` after split). The username input should show placeholder text "Username configured" when `username_set` is true, and the form should send the username on save only when the user types a new value.

> Note: This pairs naturally with Task 10 (settings split). If doing in parallel, coordinate the field name change.

**Step 4: Commit**

```bash
git add backend/src/cassini/api/v1/notifications.py backend/src/cassini/api/schemas/notification.py
git commit -m "fix: mask SMTP username in config response instead of leaking encrypted blob"
```

---

## Wave 2: Database Migration

### Task 4: Migration 039 — Severity Filter, Password Reset, Email Verification

**Files:**
- Create: `backend/alembic/versions/039_account_management_and_notifications.py`
- Modify: `backend/src/cassini/db/models/notification.py` (add severity_filter column)
- Modify: `backend/src/cassini/db/models/user.py` (add pending_email column, token models)

**Step 1: Add severity_filter to NotificationPreference model**

In `backend/src/cassini/db/models/notification.py`, inside `NotificationPreference` class, after the `is_enabled` column (around line 87):

```python
    severity_filter: Mapped[str] = mapped_column(
        String(30), default="all", server_default="all", nullable=False
    )
```

**Step 2: Add pending_email to User model and create token models**

In `backend/src/cassini/db/models/user.py`, add to User class after `last_signature_auth_at`:

```python
    pending_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
```

Create new model file `backend/src/cassini/db/models/auth_token.py`:

```python
"""Password reset and email verification token models."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from cassini.db.base import Base


class PasswordResetToken(Base):
    """Time-limited token for password reset flow."""

    __tablename__ = "password_reset_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmailVerificationToken(Base):
    """Time-limited token for email address verification."""

    __tablename__ = "email_verification_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    new_email: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

**Step 3: Register models in db/models/__init__.py**

Add import for `PasswordResetToken` and `EmailVerificationToken` in the models init file so Alembic discovers them.

**Step 4: Generate migration**

```bash
cd backend && alembic revision --autogenerate -m "account management severity filter and auth tokens"
```

**Step 5: Review the generated migration**

Verify it creates:
- `severity_filter` column on `notification_preference` (String(30), default 'all')
- `pending_email` column on `user` (String(255), nullable)
- `password_reset_token` table (id, user_id FK, token_hash indexed, expires_at, used_at, created_at)
- `email_verification_token` table (id, user_id FK, token_hash indexed, new_email, expires_at, used_at, created_at)

**Step 6: Run migration**

```bash
cd backend && alembic upgrade head
```

**Step 7: Commit**

```bash
git add backend/src/cassini/db/models/auth_token.py backend/src/cassini/db/models/notification.py backend/src/cassini/db/models/user.py backend/src/cassini/db/models/__init__.py backend/alembic/versions/
git commit -m "feat: migration 039 — severity filter, password reset tokens, email verification"
```

---

## Wave 3: Backend Endpoints (Depends on Wave 2)

### Task 5: Severity Filtering in Notification Dispatcher

**Files:**
- Modify: `backend/src/cassini/core/notifications.py` (lines 76-102, 241-261)

**Step 1: Add severity mapping constant**

At module level in `notifications.py`, after imports:

```python
# Nelson rule severity mapping
RULE_SEVERITY: dict[int, str] = {
    1: "critical",     # Beyond control limits
    2: "warning",      # Run of 9 above/below
    3: "warning",      # Run of 6 increasing/decreasing
    4: "warning",      # 14 alternating
    5: "info",         # 2 of 3 in Zone A
    6: "info",         # 4 of 5 in Zone B
    7: "info",         # 15 in Zone C
    8: "info",         # 8 outside Zone C
}

SEVERITY_HIERARCHY = {"critical": 0, "warning": 1, "info": 2}
```

**Step 2: Add severity check in _on_violation_created**

In `_on_violation_created()` (line 76), add severity lookup before dispatching. Pass the rule severity to `_dispatch`:

```python
async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
    """Handle ViolationCreatedEvent — send email + webhook notifications."""
    rule_severity = RULE_SEVERITY.get(event.rule_id, "info")

    payload = { ... }  # existing payload
    subject = f"[Cassini] Violation: {event.rule_name} (Rule {event.rule_id})"
    body = ( ... )  # existing body

    await self._dispatch(
        event_type="violation_created",
        payload=payload,
        email_subject=subject,
        email_body=body,
        rule_severity=rule_severity,
    )
```

**Step 3: Filter by severity_filter in _dispatch**

In `_dispatch()` (around line 241), modify the preference query to join severity filtering:

```python
async def _dispatch(
    self,
    event_type: str,
    payload: dict,
    email_subject: str,
    email_body: str,
    rule_severity: str | None = None,
) -> None:
```

In the email preference query section (lines 243-250), add severity filter:

```python
    pref_query = select(NotificationPreference.user_id).where(
        NotificationPreference.event_type == event_type,
        NotificationPreference.channel == "email",
        NotificationPreference.is_enabled == True,  # noqa: E712
    )

    # Filter by severity if this is a violation event
    if rule_severity:
        # "all" matches everything, "critical_and_warning" excludes info, "critical_only" excludes warning+info
        if rule_severity == "info":
            pref_query = pref_query.where(
                NotificationPreference.severity_filter == "all"
            )
        elif rule_severity == "warning":
            pref_query = pref_query.where(
                NotificationPreference.severity_filter.in_(["all", "critical_and_warning"])
            )
        # critical always passes

    pref_result = await session.execute(pref_query)
```

Apply the same pattern for the webhook section if webhooks have per-user preferences.

**Step 4: Verify backend starts**

```bash
cd backend && uvicorn cassini.main:app --reload
```

**Step 5: Commit**

```bash
git add backend/src/cassini/core/notifications.py
git commit -m "feat: severity-based filtering for violation notifications"
```

---

### Task 6: Push Service Preference Gating

**Files:**
- Modify: `backend/src/cassini/core/push_service.py` (lines 69-81, 97-152)

**Step 1: Import NotificationPreference model**

Add import at top of `push_service.py`:

```python
from cassini.db.models.notification import NotificationPreference
```

**Step 2: Filter push recipients by preference**

In `_on_violation_created()`, replace the `_send_to_all()` call with preference-gated sending:

```python
async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
    """Handle violation event -- send push only to users with matching preferences."""
    from cassini.core.notifications import RULE_SEVERITY, SEVERITY_HIERARCHY

    rule_severity = RULE_SEVERITY.get(event.rule_id, "info")

    payload = {
        "title": "SPC Violation Detected",
        "body": f"Rule {event.rule_id} ({event.rule_name}) -- {event.severity}",
        "tag": f"violation-{event.violation_id}",
        "data": {
            "url": f"/violations?highlight={event.violation_id}",
            "characteristic_id": event.characteristic_id,
        },
    }
    recipients = await self._send_filtered(
        json.dumps(payload),
        event_type="violation_created",
        rule_severity=rule_severity,
    )
    await self._audit_push_send("violation_created", recipients)
```

**Step 3: Create _send_filtered method**

Add new method that queries preferences before sending:

```python
async def _send_filtered(
    self, payload: str, event_type: str, rule_severity: str | None = None
) -> int:
    """Send push notification only to users whose preferences match."""
    if not self._initialized or self._webpush is None:
        return 0

    async with self._session_factory() as session:
        # Get user IDs with matching push preferences
        pref_query = select(NotificationPreference.user_id).where(
            NotificationPreference.event_type == event_type,
            NotificationPreference.channel == "push",
            NotificationPreference.is_enabled == True,  # noqa: E712
        )

        if rule_severity == "info":
            pref_query = pref_query.where(
                NotificationPreference.severity_filter == "all"
            )
        elif rule_severity == "warning":
            pref_query = pref_query.where(
                NotificationPreference.severity_filter.in_(["all", "critical_and_warning"])
            )

        pref_result = await session.execute(pref_query)
        allowed_user_ids = {row[0] for row in pref_result.all()}

        if not allowed_user_ids:
            return 0

        stmt = select(PushSubscription).where(
            PushSubscription.user_id.in_(allowed_user_ids)
        )
        result = await session.execute(stmt)
        subscriptions = result.scalars().all()

        # ... rest of send logic (same as _send_to_all)
```

> Note: Check if `PushSubscription` has a `user_id` column. If not, push stays all-or-nothing for now and we add a TODO.

**Step 4: Commit**

```bash
git add backend/src/cassini/core/push_service.py
git commit -m "feat: gate push notifications by user preference and severity filter"
```

---

### Task 7: Forgot Password & Reset Password Endpoints

**Files:**
- Modify: `backend/src/cassini/api/v1/auth.py` (after line 311)
- Modify: `backend/src/cassini/api/schemas/auth.py` (or create if needed)
- Modify: `backend/src/cassini/core/audit.py`

**Step 1: Add schemas**

Check if `backend/src/cassini/api/schemas/auth.py` exists. If not, create it:

```python
"""Auth-related request/response schemas."""

from pydantic import BaseModel, EmailStr


class ForgotPasswordRequest(BaseModel):
    identifier: str  # username or email


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None


class UpdateProfileResponse(BaseModel):
    message: str
    email_verification_sent: bool = False
```

**Step 2: Add forgot-password endpoint**

In `backend/src/cassini/api/v1/auth.py`, after the `change_password` endpoint (line 311), add:

```python
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from cassini.db.models.auth_token import PasswordResetToken
from cassini.api.schemas.auth import ForgotPasswordRequest, ResetPasswordRequest


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Request a password reset link. Always returns success to prevent enumeration."""
    # Rate limit: max 3 per identifier per hour
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)

    # Look up user by username or email
    user_result = await session.execute(
        select(User).where(
            sa.or_(User.username == data.identifier, User.email == data.identifier)
        )
    )
    user = user_result.scalar_one_or_none()

    if user and user.email:
        # Check rate limit
        count_result = await session.execute(
            select(sa.func.count(PasswordResetToken.id)).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.created_at >= one_hour_ago,
            )
        )
        count = count_result.scalar() or 0

        if count < 3:
            # Generate token
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

            token = PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
            session.add(token)
            await session.commit()

            # Send email via SMTP
            smtp_config = await session.execute(
                select(SmtpConfig).where(SmtpConfig.is_active == True)  # noqa: E712
            )
            smtp = smtp_config.scalar_one_or_none()
            if smtp:
                # Import email sending utility
                from cassini.core.notifications import send_email
                reset_url = f"/reset-password?token={raw_token}"
                await send_email(
                    smtp_config=smtp,
                    to_address=user.email,
                    subject="[Cassini] Password Reset Request",
                    body=f"Click the following link to reset your password:\n\n{reset_url}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.",
                    session=session,
                )

            # Audit log (only if user found — prevent enumeration)
            from cassini.core.audit import AuditService
            audit = AuditService(session)
            await audit.log(
                user_id=user.id,
                action="password_reset_requested",
                resource_type="auth",
                resource_id=str(user.id),
                details={"identifier": data.identifier},
            )

    # Always return success
    return {"message": "If an account with that identifier exists, a reset link has been sent."}
```

**Step 3: Add reset-password endpoint**

```python
@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Reset password using a valid token."""
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()

    result = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
    )
    token = result.scalar_one_or_none()

    if not token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Validate password length
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Update password
    user_result = await session.execute(select(User).where(User.id == token.user_id))
    user = user_result.scalar_one()

    user.hashed_password = pwd_context.hash(data.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    user.must_change_password = False

    # Consume token
    token.used_at = datetime.now(timezone.utc)

    # Invalidate all existing refresh tokens for this user
    await session.execute(
        sa.delete(RefreshToken).where(RefreshToken.user_id == user.id)
    )

    await session.commit()

    # Audit log
    from cassini.core.audit import AuditService
    audit = AuditService(session)
    await audit.log(
        user_id=user.id,
        action="password_reset_completed",
        resource_type="auth",
        resource_id=str(user.id),
    )

    return {"message": "Password reset successfully. Please log in with your new password."}
```

**Step 4: Verify endpoints load**

```bash
cd backend && uvicorn cassini.main:app --reload
# Check /docs for new endpoints
```

**Step 5: Commit**

```bash
git add backend/src/cassini/api/v1/auth.py backend/src/cassini/api/schemas/auth.py
git commit -m "feat: forgot-password and reset-password endpoints with rate limiting"
```

---

### Task 8: Update Profile & Email Verification Endpoints

**Files:**
- Modify: `backend/src/cassini/api/v1/auth.py`
- Modify: `backend/src/cassini/api/schemas/auth.py`

**Step 1: Add update-profile endpoint**

In `backend/src/cassini/api/v1/auth.py`, after the reset-password endpoint:

```python
from cassini.db.models.auth_token import EmailVerificationToken
from cassini.api.schemas.auth import UpdateProfileRequest, UpdateProfileResponse


@router.post("/update-profile", response_model=UpdateProfileResponse)
async def update_profile(
    data: UpdateProfileRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Update user's own profile (display name, email)."""
    email_verification_sent = False

    if data.display_name is not None:
        current_user.full_name = data.display_name

    if data.email is not None and data.email != current_user.email:
        # Send verification email to new address
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        verification = EmailVerificationToken(
            user_id=current_user.id,
            token_hash=token_hash,
            new_email=data.email,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        session.add(verification)
        current_user.pending_email = data.email

        # Send verification email
        smtp_result = await session.execute(
            select(SmtpConfig).where(SmtpConfig.is_active == True)  # noqa: E712
        )
        smtp = smtp_result.scalar_one_or_none()
        if smtp:
            from cassini.core.notifications import send_email
            verify_url = f"/verify-email?token={raw_token}"
            await send_email(
                smtp_config=smtp,
                to_address=data.email,
                subject="[Cassini] Verify Your Email Address",
                body=f"Click the following link to verify your email:\n\n{verify_url}\n\nThis link expires in 24 hours.",
                session=session,
            )
            email_verification_sent = True

    await session.commit()

    return UpdateProfileResponse(
        message="Profile updated successfully",
        email_verification_sent=email_verification_sent,
    )
```

**Step 2: Add verify-email endpoint**

```python
@router.get("/verify-email")
async def verify_email(
    token: str,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify new email address via token from email link."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    result = await session.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > datetime.now(timezone.utc),
        )
    )
    verification = result.scalar_one_or_none()

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    # Update user email
    user_result = await session.execute(
        select(User).where(User.id == verification.user_id)
    )
    user = user_result.scalar_one()

    old_email = user.email
    user.email = verification.new_email
    user.pending_email = None

    # Consume token
    verification.used_at = datetime.now(timezone.utc)

    await session.commit()

    # Audit log (unauthenticated — explicit log)
    from cassini.core.audit import AuditService
    audit = AuditService(session)
    await audit.log(
        user_id=user.id,
        action="email_verified",
        resource_type="auth",
        resource_id=str(user.id),
        details={"old_email": old_email, "new_email": verification.new_email},
    )

    return {"message": "Email verified successfully"}
```

**Step 3: Commit**

```bash
git add backend/src/cassini/api/v1/auth.py backend/src/cassini/api/schemas/auth.py
git commit -m "feat: update-profile and email verification endpoints"
```

---

### Task 9: Audit Trail Wiring

**Files:**
- Modify: `backend/src/cassini/core/audit.py` (lines 22-62, 78-128)
- Modify: `frontend/src/components/AuditLogViewer.tsx` (lines 20-47, 49-80)

**Step 1: Add resource patterns in audit.py**

In `_RESOURCE_PATTERNS` list (around line 22-62), add:

```python
    (re.compile(r"/api/v1/auth/forgot-password"), "auth"),
    (re.compile(r"/api/v1/auth/reset-password"), "auth"),
    (re.compile(r"/api/v1/auth/verify-email"), "auth"),
    (re.compile(r"/api/v1/auth/update-profile"), "auth"),
```

**Step 2: Add action keywords in _method_to_action**

In `_method_to_action()` (around line 78), add before the method_map fallback:

```python
    if "forgot-password" in path:
        return "password_reset_requested"
    if "reset-password" in path:
        return "password_reset_completed"
    if "verify-email" in path:
        return "email_verified"
    if "update-profile" in path:
        return "profile_updated"
```

**Step 3: Add labels in AuditLogViewer.tsx**

In `ACTION_LABELS` (line 20-47), add:

```typescript
  password_reset_requested: 'Password Reset Requested',
  password_reset_completed: 'Password Reset',
  email_verified: 'Email Verified',
  profile_updated: 'Profile Updated',
```

In `RESOURCE_LABELS` (line 49-80), add:

```typescript
  auth: 'Authentication',
```

In the `ActionBadge` color map, add:

```typescript
  password_reset_requested: 'bg-warning/10 text-warning',
  password_reset_completed: 'bg-warning/10 text-warning',
  email_verified: 'bg-primary/10 text-primary',
  profile_updated: 'bg-primary/10 text-primary',
```

**Step 4: Commit**

```bash
git add backend/src/cassini/core/audit.py frontend/src/components/AuditLogViewer.tsx
git commit -m "feat: audit trail wiring for password reset, email verification, profile updates"
```

---

## Wave 4: Frontend — Settings Restructure (Depends on Wave 1 Task 3)

### Task 10: Split NotificationsSettings into Two Components

**Files:**
- Modify: `frontend/src/components/NotificationsSettings.tsx` (705 lines → keep PushSection + PreferencesSection)
- Create: `frontend/src/components/EmailWebhookSettings.tsx` (extract SmtpSection + WebhookSection)

**Step 1: Create EmailWebhookSettings component**

Extract `SmtpSection` (lines 315-497) and `WebhookSection` (lines 503-704) from `NotificationsSettings.tsx` into a new file `frontend/src/components/EmailWebhookSettings.tsx`.

The new component should:
- Import all hooks/schemas needed by SMTP and webhook sections
- Export a single `EmailWebhookSettings` function component
- Render SmtpSection and WebhookSection in a single page
- Handle the `username_set` boolean change from Task 3 (show "Username configured" placeholder when true)

```typescript
export function EmailWebhookSettings() {
  return (
    <div className="space-y-8">
      <SmtpSection />
      <WebhookSection />
    </div>
  )
}
```

**Step 2: Slim down NotificationsSettings**

Remove SmtpSection and WebhookSection from `NotificationsSettings.tsx`. Remove the admin-only conditional rendering. The component becomes:

```typescript
export function NotificationsSettings() {
  return (
    <div className="space-y-8">
      <PushSection />
      <PreferencesSection />
    </div>
  )
}
```

Rename the file to `NotificationPreferences.tsx` (optional, but clearer).

**Step 3: Add missing event types to PreferencesSection**

In the `EVENT_TYPES` array (currently lines 25-36), add:

```typescript
const EVENT_TYPES = [
  { key: 'violation_created', label: 'Violation Detected', description: 'Nelson rule violation on a control chart' },
  { key: 'limits_updated', label: 'Limits Updated', description: 'Control limits recalculated' },
  { key: 'anomaly_detected', label: 'Anomaly Detected', description: 'AI/ML anomaly detection alert' },
  { key: 'signature_created', label: 'Signature Required', description: 'Electronic signature workflow initiated' },
  { key: 'workflow_completed', label: 'Workflow Completed', description: 'Approval workflow completed' },
]
```

**Step 4: Add severity filter dropdown to PreferencesSection**

For the `violation_created` row, add a dropdown after the channel toggles:

```typescript
{eventType.key === 'violation_created' && (
  <select
    value={severityFilter}
    onChange={(e) => handleSeverityChange(e.target.value)}
    className="bg-background border-border rounded-md border px-2 py-1 text-xs"
  >
    <option value="all">All violations</option>
    <option value="critical_and_warning">Critical + Warning</option>
    <option value="critical_only">Critical only</option>
  </select>
)}
```

Wire this to the notification preferences API — the `severity_filter` value should be included in the preference update payload.

**Step 5: Verify both components render**

```bash
cd frontend && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add frontend/src/components/NotificationsSettings.tsx frontend/src/components/EmailWebhookSettings.tsx
git commit -m "refactor: split notification settings into personal preferences and admin email/webhook config"
```

---

### Task 11: Wire New Settings Pages into Sidebar & Routes

**Files:**
- Modify: `frontend/src/pages/SettingsView.tsx` (lines 3-17 imports, lines 35-74 sidebar groups)
- Modify: `frontend/src/App.tsx` (settings routes section)
- Modify: `frontend/src/i18n/locales/en/settings.json`

**Step 1: Add sidebar entries**

In `SettingsView.tsx`:

1. Add imports: `User` (or `CircleUser`) and `Mail` from lucide-react
2. Add Account tab to personal group (FIRST position):

```typescript
{
  labelKey: 'groups.personal',
  tabs: [
    { to: 'account', labelKey: 'tabs.account', icon: CircleUser },
    { to: 'appearance', labelKey: 'tabs.appearance', icon: Palette },
    { to: 'notifications', labelKey: 'tabs.notifications', icon: Bell },
  ],
},
```

3. Add Email & Webhooks to organization group:

```typescript
{
  labelKey: 'groups.organization',
  tabs: [
    { to: 'sites', labelKey: 'tabs.sites', icon: Factory, minRole: 'admin' },
    { to: 'branding', labelKey: 'tabs.branding', icon: Building2, minRole: 'admin' },
    { to: 'localization', labelKey: 'tabs.localization', icon: Globe, minRole: 'admin' },
    { to: 'email-webhooks', labelKey: 'tabs.emailWebhooks', icon: Mail, minRole: 'admin' },
  ],
},
```

**Step 2: Add routes in App.tsx**

Import the new components and add routes in the settings routes section:

```typescript
<Route path="account" element={<AccountSettings />} />
<Route path="email-webhooks" element={<EmailWebhookSettings />} />
```

**Step 3: Add i18n keys**

In `frontend/src/i18n/locales/en/settings.json`, add to `tabs`:

```json
"account": "Account",
"emailWebhooks": "Email & Webhooks"
```

**Step 4: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/pages/SettingsView.tsx frontend/src/App.tsx frontend/src/i18n/locales/en/settings.json
git commit -m "feat: add Account and Email & Webhooks pages to settings sidebar"
```

---

## Wave 5: Frontend — New Pages (Depends on Wave 3 + Wave 4)

### Task 12: AccountSettings Component

**Files:**
- Create: `frontend/src/components/AccountSettings.tsx`
- Modify: `frontend/src/api/auth.api.ts` (add updateProfile, verifyEmail methods)
- Create: `frontend/src/api/hooks/useAccount.ts` (new hooks)

**Step 1: Add API methods**

In `frontend/src/api/auth.api.ts`, add to the `authApi` object:

```typescript
  updateProfile: (data: { display_name?: string; email?: string }) =>
    fetchApi<{ message: string; email_verification_sent: boolean }>('/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  forgotPassword: (identifier: string) =>
    fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    }).then(async (res) => {
      if (!res.ok) throw new Error('Request failed')
      return res.json() as Promise<{ message: string }>
    }),

  resetPassword: (token: string, newPassword: string) =>
    fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Reset failed' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Reset failed')
      }
      return res.json() as Promise<{ message: string }>
    }),
```

**Step 2: Create account hooks**

Create `frontend/src/api/hooks/useAccount.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.api'
import { toast } from 'sonner'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { display_name?: string; email?: string }) =>
      authApi.updateProfile(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      toast.success(result.message)
      if (result.email_verification_sent) {
        toast.info('Verification email sent to new address')
      }
    },
    onError: () => toast.error('Failed to update profile'),
  })
}
```

Export from `frontend/src/api/hooks/index.ts`.

**Step 3: Create AccountSettings component**

Create `frontend/src/components/AccountSettings.tsx`. Structure:

```typescript
export function AccountSettings() {
  // Use useAuth() to get current user info
  // Profile section: display_name (editable), username (read-only), email (editable with pending badge)
  // Password section: current + new + confirm (reuse ChangePasswordPage validation pattern)

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <section>
        <h2>Profile</h2>
        {/* display_name input */}
        {/* username read-only */}
        {/* email input with pending verification badge */}
        {/* Save button */}
      </section>

      {/* Change Password Section */}
      <section>
        <h2>Change Password</h2>
        {/* current password */}
        {/* new password */}
        {/* confirm password */}
        {/* Change Password button */}
      </section>
    </div>
  )
}
```

Follow the styling patterns from `ChangePasswordPage.tsx` (input field classes, error display, button disabled states) and `NotificationsSettings.tsx` (section layout with heading + description).

The username field should be:
```typescript
<input
  value={user.username}
  disabled
  className="bg-muted text-muted-foreground cursor-not-allowed ..."
/>
<p className="text-muted-foreground text-xs mt-1">Managed by administrator</p>
```

The pending email badge:
```typescript
{user.pending_email && (
  <div className="bg-warning/10 text-warning rounded-md px-3 py-2 text-xs">
    Pending verification: {user.pending_email}
  </div>
)}
```

**Step 4: Type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/components/AccountSettings.tsx frontend/src/api/auth.api.ts frontend/src/api/hooks/useAccount.ts frontend/src/api/hooks/index.ts
git commit -m "feat: account settings page with profile editing and voluntary password change"
```

---

### Task 13: Forgot Password & Reset Password Pages

**Files:**
- Create: `frontend/src/pages/ForgotPasswordPage.tsx`
- Create: `frontend/src/pages/ResetPasswordPage.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx` (wire forgot password link)
- Modify: `frontend/src/App.tsx` (add public routes)

**Step 1: Create ForgotPasswordPage**

Create `frontend/src/pages/ForgotPasswordPage.tsx`:

Use the same styling as `LoginPage.tsx` (Cassini branding, Saturn background, retro style). Show:
- Title: "Reset Your Password"
- Input: username or email
- Submit button
- Success state: "If an account exists, a reset link has been sent to the associated email."
- "Back to Sign In" link
- If SMTP not configured: "Contact your administrator to reset your password"

> Note: To detect SMTP availability, you can attempt the request and handle gracefully, or add a public health endpoint. Simplest: always show the form, the backend handles the SMTP-not-configured case silently.

```typescript
export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await authApi.forgotPassword(identifier)
    } catch {
      // Always show success to prevent enumeration
    } finally {
      setSubmitted(true)
      setIsSubmitting(false)
    }
  }

  // ... render with LoginPage-style branding
}
```

**Step 2: Create ResetPasswordPage**

Create `frontend/src/pages/ResetPasswordPage.tsx`:

Same branding. Show:
- Title: "Set New Password"
- New password + confirm password inputs
- Validation: min 8 chars, passwords match
- Submit calls `authApi.resetPassword(token, newPassword)`
- Token from URL: `useSearchParams().get('token')`
- On success: redirect to `/login` with success toast
- On error: show error (expired/invalid token)

**Step 3: Wire up LoginPage forgot password link**

In `frontend/src/pages/LoginPage.tsx`, lines 227-235. Replace the dead link:

```typescript
<Link
  to="/forgot-password"
  className="text-[10px] font-mono uppercase transition-colors hover:text-[#F4F1DE]"
  style={{ color: '#4B5563' }}
  tabIndex={-1}
>
  Forgot Password?
</Link>
```

Change from `<a>` to React Router `<Link>`. Remove `onClick={preventDefault}`. Add `Link` import.

**Step 4: Add public routes in App.tsx**

Near the login route (around line 185), add:

```typescript
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
```

These must be public (outside `RequireAuth`).

**Step 5: Type check and verify**

```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run dev
# Navigate to /forgot-password, verify page renders
```

**Step 6: Commit**

```bash
git add frontend/src/pages/ForgotPasswordPage.tsx frontend/src/pages/ResetPasswordPage.tsx frontend/src/pages/LoginPage.tsx frontend/src/App.tsx
git commit -m "feat: forgot password and reset password pages with login page wiring"
```

---

### Task 14: Add Notification Preference Schema Updates

**Files:**
- Modify: `backend/src/cassini/api/schemas/notification.py`
- Modify: `frontend/src/api/notifications.api.ts` (if schema types need updating)
- Modify: `frontend/src/api/hooks/notifications.ts` (if preference hooks need updating)

**Step 1: Update backend preference schemas**

In `backend/src/cassini/api/schemas/notification.py`, update `NotificationPreferenceItem`:

```python
class NotificationPreferenceItem(BaseModel):
    event_type: str
    channel: str
    is_enabled: bool
    severity_filter: str = "all"  # "all", "critical_and_warning", "critical_only"
```

Update `NotificationPreferenceResponse`:

```python
class NotificationPreferenceResponse(BaseModel):
    id: int
    event_type: str
    channel: str
    is_enabled: bool
    severity_filter: str
```

**Step 2: Update preference save endpoint**

In `backend/src/cassini/api/v1/notifications.py`, in the preference update handler, ensure `severity_filter` is saved:

```python
pref.severity_filter = item.severity_filter
```

**Step 3: Update frontend types and hooks if needed**

Ensure the frontend preference type includes `severity_filter` and the mutation sends it.

**Step 4: Commit**

```bash
git add backend/src/cassini/api/schemas/notification.py backend/src/cassini/api/v1/notifications.py frontend/src/api/notifications.api.ts frontend/src/api/hooks/notifications.ts
git commit -m "feat: severity filter in notification preference schemas and save flow"
```

---

## Wave 6: Verification & Polish

### Task 15: Full Integration Verification

**Step 1: Backend verification**

```bash
cd backend && uvicorn cassini.main:app --reload
# Verify in /docs:
# - POST /auth/forgot-password exists
# - POST /auth/reset-password exists
# - POST /auth/update-profile exists
# - GET /auth/verify-email exists
# - GET /notifications/smtp returns username_set (boolean, not encrypted string)
```

**Step 2: Frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Frontend build**

```bash
cd frontend && npm run build
```

**Step 4: Manual verification**

- Toast: Trigger a toast, verify X button stays pinned on hover
- Settings: Verify Account page appears first in Personal group
- Settings: Verify Email & Webhooks appears in Organization group (admin only)
- Notifications: Verify all 5 event types shown in preferences
- Notifications: Verify severity dropdown appears for violation_created
- Login: Verify "Forgot Password?" link navigates to /forgot-password
- Account: Verify display name editable, username read-only, password change works

**Step 5: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore: integration polish and type fixes"
```

---

## Dependency Graph

```
Wave 1 (parallel):
  Task 1: Toast CSS ─────────────────────────────────────────┐
  Task 2: Attribute engine event bus ────────────────────────┤
  Task 3: SMTP username fix ─────────────────────────────────┤
                                                              │
Wave 2 (after any Wave 1):                                    │
  Task 4: Migration 039 ─────────────────────────────────────┤
                                                              │
Wave 3 (after Task 4):                                        │
  Task 5: Severity filtering ────────────────────────────────┤
  Task 6: Push preference gating ────────────────────────────┤
  Task 7: Forgot/reset password endpoints ───────────────────┤
  Task 8: Update profile/verify email endpoints ─────────────┤
  Task 9: Audit trail wiring ────────────────────────────────┤
                                                              │
Wave 4 (after Task 3, parallel with Wave 3):                  │
  Task 10: Split NotificationsSettings ──────────────────────┤
  Task 11: Wire settings sidebar + routes ───────────────────┤
                                                              │
Wave 5 (after Wave 3 + Wave 4):                               │
  Task 12: AccountSettings component ────────────────────────┤
  Task 13: ForgotPassword + ResetPassword pages ─────────────┤
  Task 14: Notification preference schema updates ───────────┤
                                                              │
Wave 6 (after all):                                           │
  Task 15: Full integration verification ────────────────────┘
```
