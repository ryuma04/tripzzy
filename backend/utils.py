import os
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt
import random
import aiosmtplib
from email.message import EmailMessage
from dotenv import load_dotenv
from imagekitio import ImageKit

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

# OTP Storage (In-memory for hackathon simplicity, ideally use Redis)
otp_store = {}

imagekit = ImageKit(
    public_key=os.getenv("IMAGEKIT_PUBLIC_KEY", ""),
    private_key=os.getenv("IMAGEKIT_PRIVATE_KEY", ""),
    url_endpoint=os.getenv("IMAGEKIT_URL_ENDPOINT", "")
)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def send_otp_email(email: str):
    otp = str(random.randint(100000, 999999))
    otp_store[email] = otp
    
    msg = EmailMessage()
    msg["Subject"] = "Your OTP for Registration"
    msg["From"] = os.getenv("SMTP_USERNAME")
    msg["To"] = email
    msg.set_content(f"Your OTP code is {otp}. It is valid for 10 minutes.")

    try:
        await aiosmtplib.send(
            msg,
            hostname=os.getenv("SMTP_SERVER"),
            port=int(os.getenv("SMTP_PORT")),
            username=os.getenv("SMTP_USERNAME"),
            password=os.getenv("SMTP_PASSWORD"),
            use_tls=False,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

def verify_otp(email: str, otp: str):
    if email in otp_store and otp_store[email] == otp:
        del otp_store[email]
        return True
    return False

def upload_image(file_bytes: bytes, file_name: str):
    try:
        res = imagekit.upload_file(file=file_bytes, file_name=file_name)
        return res.url
    except Exception as e:
        print(f"ImageKit Upload Error: {e}")
        return None
