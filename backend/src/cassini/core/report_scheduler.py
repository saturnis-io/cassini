"""Report scheduler — background service that generates and emails scheduled reports.

Periodically checks for due report schedules, generates PDF reports, and delivers
them via SMTP. Follows the same pattern as PurgeEngine in core/purge_engine.py.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog
from sqlalchemy import select

from cassini.db.database import get_database
from cassini.db.models.notification import SmtpConfig
from cassini.db.models.report_schedule import ReportSchedule
from cassini.db.repositories.report_schedule import ReportScheduleRepository

logger = structlog.get_logger(__name__)

# Check interval: 15 minutes
CHECK_INTERVAL_SECONDS = 15 * 60


class ReportScheduler:
    """Background service that periodically generates and emails scheduled reports."""

    def __init__(self, interval_seconds: float = CHECK_INTERVAL_SECONDS) -> None:
        self.interval_seconds = interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background scheduler loop."""
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info(
            "report_scheduler_started",
            interval_seconds=self.interval_seconds,
        )

    async def stop(self) -> None:
        """Stop the background scheduler loop gracefully."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("report_scheduler_stopped")

    async def _scheduler_loop(self) -> None:
        """Main loop — check for due schedules then sleep."""
        while self._running:
            try:
                await self._check_and_run()
            except Exception:
                logger.exception("report_scheduler_loop_error")
            # Sleep for the configured interval
            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break

    async def _check_and_run(self) -> None:
        """Check for due schedules and run them."""
        db = get_database()
        now = datetime.now(timezone.utc)

        async with db.session() as session:
            repo = ReportScheduleRepository(session)
            due_schedules = await repo.get_due_schedules(now)

        if not due_schedules:
            return

        logger.info("report_scheduler_due_found", count=len(due_schedules))

        for schedule in due_schedules:
            try:
                await self.run_schedule(schedule.id)
            except Exception:
                logger.exception(
                    "report_schedule_failed", schedule_id=schedule.id
                )

    async def run_schedule(self, schedule_id: int) -> dict:
        """Execute a single report schedule: generate PDF + email.

        Args:
            schedule_id: The schedule to execute.

        Returns:
            Summary dict with status and metadata.
        """
        db = get_database()
        now = datetime.now(timezone.utc)
        run_id: int | None = None

        # Create run record
        async with db.session() as session:
            repo = ReportScheduleRepository(session)
            schedule = await repo.get_by_id(schedule_id)
            if schedule is None:
                return {"status": "error", "message": "Schedule not found"}

            run = await repo.create_run(schedule_id, started_at=now)
            run_id = run.id

            # Extract schedule data before leaving session
            schedule_data = {
                "id": schedule.id,
                "name": schedule.name,
                "template_id": schedule.template_id,
                "scope_type": schedule.scope_type,
                "scope_id": schedule.scope_id,
                "plant_id": schedule.plant_id,
                "window_days": schedule.window_days,
                "recipients": json.loads(schedule.recipients),
            }

        try:
            # Generate the report
            from cassini.core.report_generator import generate_report

            async with db.session() as session:
                # Reload schedule for the generator (needs ORM object)
                repo = ReportScheduleRepository(session)
                schedule = await repo.get_by_id(schedule_id)
                pdf_bytes, html_content = await generate_report(schedule, session)

            # Send emails
            recipients = schedule_data["recipients"]
            recipients_sent = 0
            if recipients and pdf_bytes:
                recipients_sent = await self._send_report_emails(
                    recipients=recipients,
                    report_name=schedule_data["name"],
                    pdf_bytes=pdf_bytes,
                )

            # Mark run as success
            async with db.session() as session:
                repo = ReportScheduleRepository(session)
                await repo.update_run_status(
                    run_id,
                    status="success",
                    completed_at=datetime.now(timezone.utc),
                    recipients_count=recipients_sent,
                    pdf_size_bytes=len(pdf_bytes) if pdf_bytes else 0,
                )
                await repo.update_last_run(schedule_id, now)

            logger.info(
                "report_schedule_completed",
                schedule_id=schedule_id,
                schedule_name=schedule_data["name"],
                recipients=recipients_sent,
                pdf_size=len(pdf_bytes) if pdf_bytes else 0,
            )

            return {
                "status": "success",
                "recipients_count": recipients_sent,
                "pdf_size_bytes": len(pdf_bytes) if pdf_bytes else 0,
            }

        except Exception as e:
            # Mark run as failed
            if run_id is not None:
                try:
                    async with db.session() as session:
                        repo = ReportScheduleRepository(session)
                        await repo.update_run_status(
                            run_id,
                            status="failed",
                            completed_at=datetime.now(timezone.utc),
                            error_message=str(e),
                        )
                except Exception:
                    logger.exception("report_run_fail_record_error")
            raise

    async def _send_report_emails(
        self,
        recipients: list[str],
        report_name: str,
        pdf_bytes: bytes,
    ) -> int:
        """Send the report PDF to all recipients via SMTP.

        Returns:
            Number of recipients successfully emailed.
        """
        db = get_database()

        # Load SMTP config
        async with db.session() as session:
            smtp_result = await session.execute(
                select(SmtpConfig).where(SmtpConfig.is_active == True)  # noqa: E712
            )
            smtp_config = smtp_result.scalar_one_or_none()

        if smtp_config is None:
            logger.warning("report_email_no_smtp", msg="No active SMTP config found")
            return 0

        # Extract values
        smtp_server = smtp_config.server
        smtp_port = smtp_config.port
        smtp_username = smtp_config.username
        smtp_password = smtp_config.password
        smtp_use_tls = smtp_config.use_tls
        smtp_from = smtp_config.from_address

        # Decrypt credentials if present
        from cassini.db.dialects import decrypt_password, get_encryption_key

        decrypted_username = None
        decrypted_password = None
        if smtp_username:
            try:
                key = get_encryption_key()
                decrypted_username = decrypt_password(smtp_username, key)
            except Exception:
                decrypted_username = smtp_username
        if smtp_password:
            try:
                key = get_encryption_key()
                decrypted_password = decrypt_password(smtp_password, key)
            except Exception:
                decrypted_password = smtp_password

        sent_count = 0
        try:
            import aiosmtplib

            filename = f"{report_name.replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

            for recipient in recipients:
                try:
                    msg = MIMEMultipart()
                    msg["From"] = smtp_from
                    msg["To"] = recipient
                    msg["Subject"] = f"[Cassini] Scheduled Report: {report_name}"

                    body = (
                        f"Please find attached the scheduled report: {report_name}\n\n"
                        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
                        f"This is an automated report from Cassini.\n"
                    )
                    msg.attach(MIMEText(body, "plain"))

                    # Attach PDF
                    pdf_attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
                    pdf_attachment.add_header(
                        "Content-Disposition", "attachment", filename=filename
                    )
                    msg.attach(pdf_attachment)

                    await aiosmtplib.send(
                        msg,
                        hostname=smtp_server,
                        port=smtp_port,
                        username=decrypted_username,
                        password=decrypted_password,
                        start_tls=smtp_use_tls,
                    )
                    sent_count += 1
                    logger.debug(
                        "report_email_sent",
                        recipient=recipient,
                        report=report_name,
                    )
                except Exception:
                    logger.warning(
                        "report_email_failed",
                        recipient=recipient,
                        exc_info=True,
                    )

        except ImportError:
            logger.warning("aiosmtplib not installed — report email delivery disabled")

        return sent_count


__all__ = ["ReportScheduler"]
