import datetime as dt

from app.models.user import User


async def log_action(
    db, actor: User, action: str, target_type: str, target_id: str, meta: dict | None = None
) -> None:
    """Append-only trail of privileged actions (SystemLogs)."""
    await db.system_logs.insert_one(
        {
            "actor_id": actor.id,
            "actor_role": actor.role.value,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta or {},
            "at": dt.datetime.now(dt.timezone.utc),
        }
    )