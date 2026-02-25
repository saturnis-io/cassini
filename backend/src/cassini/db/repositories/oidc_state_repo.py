"""Repository for OIDC state tokens and account links."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.oidc_state import OIDCAccountLink, OIDCState


class OIDCStateRepository:
    """CRUD operations for OIDC state tokens and account links.

    State tokens are short-lived (typically 5 minutes) and should be
    cleaned up periodically via ``cleanup_expired()``.  Account links
    are permanent bindings between local users and IdP subjects.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # OIDC State (CSRF) management
    # ------------------------------------------------------------------

    async def create_state(
        self,
        state: str,
        nonce: str,
        provider_id: int,
        redirect_uri: str,
        expires_at: datetime,
    ) -> OIDCState:
        """Persist a new OIDC authorization state token.

        Args:
            state: Random CSRF state value (64-char hex).
            nonce: Random nonce for ID-token replay protection.
            provider_id: FK to oidc_config.
            redirect_uri: The redirect_uri sent to the IdP.
            expires_at: When this state should be considered expired.

        Returns:
            The created OIDCState row.
        """
        row = OIDCState(
            state=state,
            nonce=nonce,
            provider_id=provider_id,
            redirect_uri=redirect_uri,
            expires_at=expires_at,
        )
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)
        return row

    async def pop_state(self, state_token: str) -> Optional[OIDCState]:
        """Atomically fetch and delete an OIDC state token.

        This is the callback-side operation: the token is consumed exactly
        once.  If the token does not exist or has already been consumed,
        ``None`` is returned.

        Uses an atomic DELETE with rowcount check to prevent race conditions
        (two concurrent callbacks with the same state token).

        Args:
            state_token: The ``state`` value returned by the IdP callback.

        Returns:
            The OIDCState if found and not expired, else None.
        """
        # First read the row to get its data
        stmt = select(OIDCState).where(OIDCState.state == state_token)
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None

        # Check expiry
        now = datetime.now(timezone.utc)
        if row.expires_at.tzinfo is None:
            expired = row.expires_at < now.replace(tzinfo=None)
        else:
            expired = row.expires_at < now

        # Atomically delete — if rowcount == 0, another request consumed it first
        del_stmt = delete(OIDCState).where(OIDCState.state == state_token)
        del_result = await self.session.execute(del_stmt)
        await self.session.flush()

        if del_result.rowcount == 0:
            # Another concurrent request already consumed this state
            return None

        if expired:
            return None

        return row

    async def cleanup_expired(self) -> int:
        """Delete all expired OIDC state tokens.

        Returns:
            Number of expired rows removed.
        """
        now = datetime.now(timezone.utc)
        stmt = delete(OIDCState).where(OIDCState.expires_at < now)
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount

    # ------------------------------------------------------------------
    # Account linking
    # ------------------------------------------------------------------

    async def create_account_link(
        self,
        user_id: int,
        provider_id: int,
        oidc_subject: str,
    ) -> Optional[OIDCAccountLink]:
        """Create a binding between a local user and an OIDC subject.

        If a link already exists for this (provider_id, oidc_subject) pair
        (unique constraint), returns the existing link instead of raising.

        Args:
            user_id: FK to user.id.
            provider_id: FK to oidc_config.id.
            oidc_subject: The ``sub`` claim from the IdP.

        Returns:
            The created or existing OIDCAccountLink row, or None on error.
        """
        # Check for existing link first
        existing = await self.get_by_subject(provider_id, oidc_subject)
        if existing is not None:
            return existing

        link = OIDCAccountLink(
            user_id=user_id,
            provider_id=provider_id,
            oidc_subject=oidc_subject,
        )
        self.session.add(link)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            # Race condition: another request created the link between our check and insert
            return await self.get_by_subject(provider_id, oidc_subject)
        await self.session.refresh(link)
        return link

    async def get_account_links(self, user_id: int) -> list[OIDCAccountLink]:
        """Get all OIDC account links for a user.

        Args:
            user_id: The local user ID.

        Returns:
            List of OIDCAccountLink rows ordered by linked_at.
        """
        stmt = (
            select(OIDCAccountLink)
            .where(OIDCAccountLink.user_id == user_id)
            .order_by(OIDCAccountLink.linked_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_subject(
        self,
        provider_id: int,
        oidc_subject: str,
    ) -> Optional[OIDCAccountLink]:
        """Look up an account link by provider and OIDC subject.

        This is the primary lookup used during SSO login to find the
        local user associated with an IdP identity.

        Args:
            provider_id: FK to oidc_config.id.
            oidc_subject: The ``sub`` claim from the IdP.

        Returns:
            The OIDCAccountLink if found, else None.
        """
        stmt = select(OIDCAccountLink).where(
            OIDCAccountLink.provider_id == provider_id,
            OIDCAccountLink.oidc_subject == oidc_subject,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_account_link(self, link_id: int) -> bool:
        """Delete an account link by its primary key.

        Args:
            link_id: PK of the OIDCAccountLink to remove.

        Returns:
            True if the link was found and deleted, False otherwise.
        """
        stmt = select(OIDCAccountLink).where(OIDCAccountLink.id == link_id)
        result = await self.session.execute(stmt)
        link = result.scalar_one_or_none()
        if link is None:
            return False

        await self.session.delete(link)
        await self.session.flush()
        return True
