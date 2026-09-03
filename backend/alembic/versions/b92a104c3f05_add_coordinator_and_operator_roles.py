"""add coordinator and operator to user_role enum

Revision ID: b92a104c3f05
Revises: ac7375836db9

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b92a104c3f05'
down_revision: Union[str, None] = 'ac7375836db9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coordinator'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operator'")


def downgrade() -> None:
    # PostgreSQL cannot remove values from an enum type without dropping the type.
    pass
