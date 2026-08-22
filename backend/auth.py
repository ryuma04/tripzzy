from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
import models, schemas, utils

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.email == user.email))
    db_user = result.scalars().first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Send OTP
    success = await utils.send_otp_email(user.email)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send OTP email")
    
    hashed_password = utils.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"message": "User registered. OTP sent to email."}

@router.post("/verify-otp")
async def verify_otp(data: schemas.OTPVerify, db: AsyncSession = Depends(get_db)):
    if not utils.verify_otp(data.email, data.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    result = await db.execute(select(models.User).where(models.User.email == data.email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = True
    await db.commit()
    return {"message": "Email verified successfully"}

@router.post("/login", response_model=schemas.Token)
async def login(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.email == user.email))
    db_user = result.scalars().first()
    if not db_user or not utils.verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not db_user.is_active:
        raise HTTPException(status_code=401, detail="Email not verified")

    access_token = utils.create_access_token(data={"sub": db_user.email})
    return {"access_token": access_token, "token_type": "bearer"}
