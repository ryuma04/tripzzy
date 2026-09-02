"""bill splits, notifications, and AI plan provenance on trips

Revision ID: af7f1d4418b2
Revises: 8c0fc53b800b
Create Date: 2026-08-24 00:00:00.000000

Reconstructed. This revision had already been applied to the hosted database
-- ``alembic_version`` named it and the tables were live -- but the file
itself was never committed, which left the chain unresolvable and
``alembic upgrade head`` failing for anyone with a fresh checkout.

It is written to match the deployed schema exactly, verified column by
column against ``information_schema`` and ``pg_constraint``, so applying it
to an empty database reproduces what production already has and autogenerate
reports no drift against the models.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'af7f1d4418b2'
down_revision: Union[str, None] = '8c0fc53b800b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Trips: AI plan provenance and departure city -------------------
    ai_plan_type = postgresql.ENUM(
        'budget', 'premium', name='ai_plan_type', create_type=False
    )
    ai_plan_type.create(op.get_bind(), checkfirst=True)

    op.add_column('trips', sa.Column('origin_city', sa.String(length=100), nullable=True))
    op.add_column('trips', sa.Column('ai_plan_type', ai_plan_type, nullable=True))
    op.add_column('trips', sa.Column('ai_plan', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('trips', sa.Column('ai_plan_source', sa.String(length=20), nullable=True))

    # --- Bill splits ----------------------------------------------------
    op.create_table(
        'bill_splits',
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('created_by_id', sa.UUID(), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), server_default='INR', nullable=False),
        sa.Column('member_count', sa.Integer(), nullable=False),
        sa.Column('split_method', sa.String(length=20), server_default='equal', nullable=False),
        sa.Column('is_group', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'settled', name='bill_split_status'),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f('ck_bill_splits_currency_iso4217')),
        sa.CheckConstraint('member_count >= 1', name=op.f('ck_bill_splits_member_count_positive')),
        sa.CheckConstraint('total_amount >= 0', name=op.f('ck_bill_splits_total_non_negative')),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_bill_splits_created_by_id_users'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], name=op.f('fk_bill_splits_trip_id_trips'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_bill_splits')),
    )
    op.create_index('ix_bill_splits_created_by_id', 'bill_splits', ['created_by_id'], unique=False)
    op.create_index('ix_bill_splits_status', 'bill_splits', ['status'], unique=False)
    op.create_index('ix_bill_splits_trip_id', 'bill_splits', ['trip_id'], unique=False)

    op.create_table(
        'bill_split_members',
        sa.Column('split_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('display_name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('share_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'owes', 'paid', name='split_member_status'),
            server_default='pending',
            nullable=False,
        ),
        sa.Column('is_payer', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('length(btrim(display_name)) >= 1', name=op.f('ck_bill_split_members_display_name_not_blank')),
        sa.CheckConstraint('share_amount >= 0', name=op.f('ck_bill_split_members_share_non_negative')),
        sa.ForeignKeyConstraint(['split_id'], ['bill_splits.id'], name=op.f('fk_bill_split_members_split_id_bill_splits'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_bill_split_members_user_id_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_bill_split_members')),
        sa.UniqueConstraint('split_id', 'user_id', name='uq_bill_split_members_split_id_user_id'),
    )
    op.create_index('ix_bill_split_members_split_id', 'bill_split_members', ['split_id'], unique=False)
    op.create_index('ix_bill_split_members_user_id', 'bill_split_members', ['user_id'], unique=False)

    # --- Notifications --------------------------------------------------
    op.create_table(
        'notifications',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column(
            'type',
            sa.Enum('bill_split', 'bill_split_settled', 'trip_reminder', 'system', name='notification_type'),
            server_default='system',
            nullable=False,
        ),
        sa.Column('title', sa.String(length=160), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('link', sa.String(length=500), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('length(btrim(title)) >= 1', name=op.f('ck_notifications_title_not_blank')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications')),
    )
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'], unique=False)
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'], unique=False)
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_table('bill_split_members')
    op.drop_table('bill_splits')

    op.drop_column('trips', 'ai_plan_source')
    op.drop_column('trips', 'ai_plan')
    op.drop_column('trips', 'ai_plan_type')
    op.drop_column('trips', 'origin_city')

    bind = op.get_bind()
    for enum_name in ('notification_type', 'split_member_status', 'bill_split_status', 'ai_plan_type'):
        postgresql.ENUM(name=enum_name).drop(bind, checkfirst=True)
