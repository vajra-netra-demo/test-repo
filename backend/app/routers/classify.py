"""Sensitive-data classification — real Presidio pattern recognizers for PAN,
Aadhaar, IFSC, and GSTIN (see app/classification/), not a trained NER model.

Honest scope note: this proves the classification capability works correctly
on real text. It is NOT yet wired to a live document source (no SharePoint/
Google Drive content access exists in this build) — it's a paste/upload
endpoint a demo can use to show real detection on a real sample, not an
automated document scanner. Don't imply otherwise in a demo.
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.classification.presidio_engine import classify_text
from app.database import get_db
from app.models import ClassificationScan
from app.schemas import ClassificationScanOut, ClassifyTextRequest

router = APIRouter(prefix="/classify", tags=["classification"], dependencies=[Depends(get_current_user)])


@router.post("/text")
def classify(body: ClassifyTextRequest, db: Session = Depends(get_db)):
    result = classify_text(body.text)

    snippet = body.text[:200] + ("…" if len(body.text) > 200 else "")
    scan = ClassificationScan(
        tenant=body.tenant,
        label=body.label,
        timestamp=datetime.now().isoformat(timespec="seconds"),
        entity_counts=result["entity_counts"],
        sensitivity_score=result["sensitivity_score"],
        snippet=snippet,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    return {
        "scan_id": scan.id,
        "entity_counts": result["entity_counts"],
        "examples": result["examples"],
        "sensitivity_score": result["sensitivity_score"],
    }


@router.get("/history", response_model=List[ClassificationScanOut])
def classification_history(limit: int = 50, db: Session = Depends(get_db)):
    return (
        db.query(ClassificationScan)
        .order_by(ClassificationScan.id.desc())
        .limit(limit)
        .all()
    )
