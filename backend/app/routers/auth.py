from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, create_access_token, get_current_user, hash_password, require_admin, verify_password
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_access_token(user.username, user.role)
    return LoginResponse(access_token=token, username=user.username, role=user.role)


@router.get("/me", response_model=LoginResponse)
def me(user: CurrentUser = Depends(get_current_user)):
    return LoginResponse(access_token="", username=user.username, role=user.role)


# --- Admin-only account management --------------------------------------
# Deliberately no public /auth/register: this tool can trigger live scans,
# remediate/auto-fix findings, and revoke real GitHub access, so who gets
# an account is an admin decision, not open self-service. An admin creates
# every other account (including other admins) from here.

class UserOut(BaseModel):
    username: str
    role: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: Literal["admin", "viewer"] = "viewer"


@router.get("/users", response_model=List[UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.username).all()


@router.post("/users", response_model=UserOut, dependencies=[Depends(require_admin)])
def create_user(body: CreateUserRequest, db: Session = Depends(get_db)):
    if not body.username.strip() or not body.password:
        raise HTTPException(status_code=422, detail="Username and password are required.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail=f"User '{body.username}' already exists.")
    user = User(username=body.username, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    return UserOut(username=user.username, role=user.role)


@router.delete("/users/{username}")
def delete_user(username: str, current: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    if username == current.username:
        raise HTTPException(status_code=400, detail="You can't delete your own account while signed in as it.")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")
    if user.role == "admin" and db.query(User).filter(User.role == "admin").count() <= 1:
        raise HTTPException(status_code=400, detail="Can't delete the last remaining admin account.")
    db.delete(user)
    db.commit()
    return {"deleted": username}
