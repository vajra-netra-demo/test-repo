"""Ingestion endpoint for TriNetra's own Red Agent
(netra-mvp/agent/red_agent.py) — the team's scoped, safe attack-simulation
counterpart to the passive discovery agents (github_discovery.py,
netra_agent.py).

Deliberately narrow and safe: the Red Agent only ever executes real, but
benign, read-only MITRE ATT&CK Discovery-tactic techniques (System
Information Discovery, System Owner/User Discovery, Account Discovery,
Network Configuration Discovery, Permission Groups Discovery) against a
machine the team itself owns and runs the agent on — see red_agent.py's
own docstring for the full technique list and the deliberate exclusion of
anything destructive, credential-accessing, persistence-establishing, or
lateral-movement-capable. This module just records what the agent
actually ran and what real command output it got back; it never
instructs a target and never reaches outside this one report POST.

Auth mirrors endpoint.py: a single shared bearer token (RED_AGENT_TOKEN),
proportionate to a report-only ingestion endpoint.
"""

from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import RED_AGENT_TOKEN
from app.database import get_db
from app.models import RedAgentFinding
from app.schemas import RedAgentFindingOut, RedAgentReportRequest

router = APIRouter(prefix="/discovery", tags=["red-agent"])


def _check_token(authorization: str = Header(default="")):
    if not RED_AGENT_TOKEN:
        raise HTTPException(status_code=503, detail="Red Agent ingestion is not configured (RED_AGENT_TOKEN unset).")
    expected = f"Bearer {RED_AGENT_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing agent token.")


@router.post("/red-agent-report")
def submit_red_agent_report(
    body: RedAgentReportRequest,
    db: Session = Depends(get_db),
    _: None = Depends(_check_token),
):
    for i, result in enumerate(body.results):
        db.add(RedAgentFinding(
            id=f"{body.run_id}-{i}",
            run_id=body.run_id,
            hostname=body.hostname,
            os=body.os,
            technique_id=result.technique_id,
            technique_name=result.technique_name,
            tactic=result.tactic,
            command=result.command,
            output_snippet=result.output_snippet,
            executed_at=result.executed_at,
        ))
    db.commit()
    return {"run_id": body.run_id, "techniques_recorded": len(body.results)}


@router.get("/red-agent-runs", response_model=List[RedAgentFindingOut], dependencies=[Depends(get_current_user)])
def list_red_agent_findings(db: Session = Depends(get_db)):
    return db.query(RedAgentFinding).order_by(RedAgentFinding.executed_at.desc()).all()
