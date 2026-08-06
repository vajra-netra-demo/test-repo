"""Login/RBAC. Deliberately dependency-light: password hashing uses the
stdlib (hashlib.pbkdf2_hmac) rather than bcrypt/passlib, and JWTs use pyjwt
(pure Python) — both avoid adding a native-extension dependency, which has
repeatedly been the source of real deploy friction elsewhere in this
project (presidio/spacy, mermaid-cli, the Vercel CLI). PBKDF2-SHA256 with a
per-password random salt and 260k iterations is a legitimate, standards-
based choice (it's what Django uses by default), not a toy substitute.
"""

import base64
import hashlib
import hmac
import secrets
import time
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import JWT_SECRET_KEY
from app.database import get_db
from app.models import User

PBKDF2_ITERATIONS = 260_000
JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 24 * 3600


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_b64, digest_b64 = stored.split("$", 1)
    except ValueError:
        return False
    salt = base64.b64decode(salt_b64)
    expected = base64.b64decode(digest_b64)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return hmac.compare_digest(expected, actual)


def create_access_token(username: str, role: str) -> str:
    now = int(time.time())
    payload = {"sub": username, "role": role, "iat": now, "exp": now + JWT_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


class CurrentUser:
    def __init__(self, username: str, role: str):
        self.username = username
        self.role = role


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    payload = _decode_token(authorization[len("Bearer "):])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return CurrentUser(username=payload["sub"], role=payload.get("role", "viewer"))


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="This action requires an admin account.")
    return user


def bootstrap_admin_user(db: Session, username: str, password: Optional[str]) -> None:
    """Creates the initial admin account from ADMIN_USERNAME/ADMIN_PASSWORD
    if no users exist yet. Safe to call on every startup — a no-op once any
    user exists, so it never overwrites a password someone has since changed."""
    if not password:
        return
    if db.query(User).count() > 0:
        return
    db.add(User(username=username, password_hash=hash_password(password), role="admin"))
    db.commit()
