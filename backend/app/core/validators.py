"""Reusable field validators.

These are the *first* of the three validation layers (Pydantic, then the
service layer, then a database constraint). Spec section 2.3: the backend is
the final authority, and the frontend mirrors these same rules in Zod purely
for immediate feedback.
"""

import re
from datetime import date


NAME_RE = re.compile(r"^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'\-]*$")
PHONE_RE = re.compile(r"^\+?[0-9]{7,15}$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Rejected outright regardless of whether they satisfy the character classes.
COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "qwerty123", "admin123", "letmein1", "welcome1", "iloveyou",
    "abc12345", "passw0rd", "trustno1", "sunshine", "princess",
}


def clean_name(value: str, field: str = "Name") -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field} cannot be empty")
    if len(value) > 50:
        raise ValueError(f"{field} must be at most 50 characters")
    if not NAME_RE.match(value):
        raise ValueError(
            f"{field} may only contain letters, spaces, periods, "
            "apostrophes and hyphens"
        )
    return value


def clean_email(value: str) -> str:
    """Lowercase and trim so uniqueness is genuinely case-insensitive."""
    return value.strip().lower()


def clean_phone(value: str) -> str:
    """Strip formatting, then validate. Accepts spaces, dashes and parens."""
    stripped = re.sub(r"[\s\-()]", "", value.strip())
    if not PHONE_RE.match(stripped):
        raise ValueError(
            "Phone number must be 7 to 15 digits, optionally prefixed with '+'"
        )
    return stripped


def validate_password(password: str, *, email: str | None = None) -> str:
    """Enforce the password policy (spec section 5).

    Checks length, all four character classes, a common-password blocklist,
    and that the password does not simply echo the user's own email.
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters long")
    # bcrypt truncates beyond 72 bytes; refuse rather than hash a prefix.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password is too long (max 72 bytes)")

    missing = []
    if not re.search(r"[A-Z]", password):
        missing.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        missing.append("a lowercase letter")
    if not re.search(r"[0-9]", password):
        missing.append("a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        missing.append("a special character")
    if missing:
        raise ValueError("Password must contain " + ", ".join(missing))

    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common. Choose something less guessable.")

    if email:
        local_part = email.split("@")[0].lower()
        if len(local_part) >= 3 and local_part in password.lower():
            raise ValueError("Password must not contain your email address")

    return password


def clean_currency(value: str) -> str:
    value = value.strip().upper()
    if not CURRENCY_RE.match(value):
        raise ValueError("Currency must be a 3-letter ISO-4217 code, for example INR")
    return value


def clean_text(value: str | None, *, field: str, min_len: int = 0, max_len: int = 1000) -> str | None:
    """Trim, then length-check. Blank-after-trim becomes None when optional."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        if min_len > 0:
            raise ValueError(f"{field} cannot be empty")
        return None
    if len(value) < min_len:
        raise ValueError(f"{field} must be at least {min_len} characters")
    if len(value) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    return value
