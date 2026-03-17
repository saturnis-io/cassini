"""Distributed leader election via Valkey SET NX EX.

Used for singleton roles: reports, purge, ERP, ingestion.
Lock keys are namespaced per installation to prevent conflicts
when multiple Cassini instances share the same Valkey.

Lock key format: cassini:{instance_id}:leader:{role}
Node ID format:  {instance_id}:{hostname}:{pid}
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)


class LeaderElection:
    """Distributed leader election using Valkey SET NX EX."""

    def __init__(
        self,
        redis_client,
        role: str,
        namespace: str,
        ttl: int = 60,
        renew_interval: float = 15.0,
        on_lost: Callable[[], Awaitable[None]] | None = None,
    ):
        self._client = redis_client
        self._role = role
        self._namespace = namespace
        self._ttl = ttl
        self._renew_interval = renew_interval
        self._on_lost = on_lost
        self._lock_key = f"cassini:{namespace}:leader:{role}"
        self._node_id = f"{namespace}:{socket.gethostname()}:{os.getpid()}"
        self._is_leader = False
        self._renewal_task: asyncio.Task | None = None

    @property
    def is_leader(self) -> bool:
        return self._is_leader

    @property
    def lock_key(self) -> str:
        return self._lock_key

    async def try_acquire(self) -> bool:
        """Attempt to acquire leadership. Returns True if successful."""
        result = await self._client.set(
            self._lock_key, self._node_id, nx=True, ex=self._ttl
        )
        self._is_leader = bool(result)
        if self._is_leader:
            logger.info(
                "Acquired leadership for %s (key=%s)", self._role, self._lock_key
            )
        return self._is_leader

    async def release(self) -> None:
        """Release leadership if we hold it."""
        if not self._is_leader:
            return
        # Only delete if we still own the lock
        current = await self._client.get(self._lock_key)
        if current == self._node_id:
            await self._client.delete(self._lock_key)
            logger.info("Released leadership for %s", self._role)
        self._is_leader = False
        self.stop_renewal()

    def start_renewal(self) -> None:
        """Start the background lock renewal task."""
        if self._renewal_task is not None:
            return
        self._renewal_task = asyncio.create_task(self._renew_loop())

    def stop_renewal(self) -> None:
        """Stop the background lock renewal task."""
        if self._renewal_task:
            self._renewal_task.cancel()
            self._renewal_task = None

    async def _renew_loop(self) -> None:
        """Periodically renew the leader lock. Fires on_lost if renewal fails."""
        while self._is_leader:
            await asyncio.sleep(self._renew_interval)
            try:
                # Renew by re-setting with the same key, only if we still own it
                renewed = await self._client.set(
                    self._lock_key, self._node_id, xx=True, ex=self._ttl
                )
                if not renewed:
                    logger.warning(
                        "Lost leadership for %s — renewal failed", self._role
                    )
                    self._is_leader = False
                    if self._on_lost:
                        await self._on_lost()
                    return
            except asyncio.CancelledError:
                return
            except Exception:
                logger.exception("Leader renewal error for %s", self._role)
                self._is_leader = False
                if self._on_lost:
                    await self._on_lost()
                return
