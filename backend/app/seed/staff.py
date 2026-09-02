"""Seeds the operator's staff roster.

Without at least one membership row, `/operator/*` is unreachable for
everybody: access is granted by membership rather than by a platform role, so
there is no account that gets in by virtue of being an admin. This creates the
staff who can actually open the console.
"""

import logging

from sqlalchemy import select

from app.core.security import hash_password
from app.models import Operator, OperatorMember, User, UserPreference
from app.models.enums import OperatorRole, UserRole

logger = logging.getLogger("seed")

# Password is shared with the other demo accounts' convention. These are
# demo credentials for a local console, not secrets.
STAFF = [
    {
        "email": "operator@tripzyy.com",
        "password": "Operate@123",
        "first_name": "Kabir",
        "last_name": "Rao",
        "city": "Mumbai",
        "country": "India",
        "phone": "+919876543213",
        "role": OperatorRole.OWNER,
        "job_title": "Operations Director",
    },
    {
        "email": "coordinator@tripzyy.com",
        "password": "Coord@123",
        "first_name": "Meera",
        "last_name": "Iyer",
        "city": "Goa",
        "country": "India",
        "phone": "+919876543214",
        "role": OperatorRole.COORDINATOR,
        "job_title": "Field Coordinator",
    },
    {
        "email": "coordinator2@tripzyy.com",
        "password": "Coord@123",
        "first_name": "Arjun",
        "last_name": "Desai",
        "city": "Jaipur",
        "country": "India",
        "phone": "+919876543215",
        "role": OperatorRole.COORDINATOR,
        "job_title": "Field Coordinator",
    },
]


async def seed_staff(session, operator_slug: str = "tripzyy-journeys") -> int:
    """Give the seeded operator an owner and two coordinators."""
    operator = await session.scalar(
        select(Operator).where(Operator.slug == operator_slug)
    )
    if operator is None:
        logger.warning("no operator %r; skipping staff seed", operator_slug)
        return 0

    created = 0
    for spec in STAFF:
        spec = dict(spec)
        password = spec.pop("password")
        operator_role = spec.pop("role")
        job_title = spec.pop("job_title")

        user = await session.scalar(
            select(User).where(User.email == spec["email"])
        )
        if user is None:
            user = User(
                **spec,
                # Platform role stays `user`: operator standing comes from
                # the membership row below, not from a global role.
                role=UserRole.USER,
                hashed_password=hash_password(password),
                is_email_verified=True,
            )
            session.add(user)
            await session.flush()
            session.add(UserPreference(user_id=user.id, currency="INR"))

        membership = await session.scalar(
            select(OperatorMember).where(
                OperatorMember.operator_id == operator.id,
                OperatorMember.user_id == user.id,
            )
        )
        if membership is None:
            membership = OperatorMember(
                operator_id=operator.id, user_id=user.id
            )
            session.add(membership)
            created += 1
        membership.role = operator_role
        membership.job_title = job_title
        membership.is_active = True

    await session.flush()
    logger.info("staff: %d memberships created, %d total", created, len(STAFF))
    return created
