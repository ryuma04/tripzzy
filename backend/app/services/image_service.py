"""Image upload service using ImageKit or local fallback."""

import base64
import logging
import os
import uuid
from pathlib import Path

import httpx
from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class ImageService:
    @staticmethod
    async def upload_avatar(file: UploadFile, user_id: uuid.UUID) -> str:
        """Upload an avatar image to ImageKit or fallback to local disk."""
        content_type = file.content_type or ""
        if not content_type.startswith("image/"):
            raise ValidationError("Uploaded file must be an image (JPEG, PNG, WEBP, etc.)")

        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:  # 5MB max
            raise ValidationError("Image file size cannot exceed 5MB")

        ext = Path(file.filename or "avatar.png").suffix or ".png"
        filename = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}{ext}"

        if settings.imagekit_configured:
            try:
                b64_content = base64.b64encode(contents).decode("utf-8")
                auth = (settings.IMAGEKIT_PRIVATE_KEY or "", "")
                data = {
                    "file": b64_content,
                    "fileName": filename,
                    "folder": "/tripzyy/avatars",
                    "useUniqueFileName": "true",
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        "https://upload.imagekit.io/api/v1/files/upload",
                        auth=auth,
                        data=data,
                    )
                    if resp.status_code in (200, 201):
                        res_json = resp.json()
                        return res_json.get("url", "")
                    else:
                        logger.warning(
                            "ImageKit upload failed with status %s: %s",
                            resp.status_code,
                            resp.text,
                        )
            except Exception as exc:
                logger.warning("ImageKit upload exception: %s", exc)

        # Fallback to local uploads directory or inline base64 if directory not writable
        try:
            upload_dir = Path(settings.UPLOAD_DIR) / "avatars"
            upload_dir.mkdir(parents=True, exist_ok=True)
            local_path = upload_dir / filename
            with open(local_path, "wb") as f:
                f.write(contents)
            return f"/static/avatars/{filename}"
        except Exception as exc:
            logger.warning("Local storage failed, falling back to data URI: %s", exc)
            b64 = base64.b64encode(contents).decode("utf-8")
            return f"data:{content_type};base64,{b64}"
