"""Robust JSON extraction from an LLM's text response.

Real-world discovered data (browser extension/software names, in particular)
can contain characters — stray backslashes, embedded quotes — that some LLM
responses fail to escape correctly inside their own JSON output. This was
found for real: a Windows-installed-software vendor field of
"Google\\Chrome" caused a genuine json.loads() failure on an otherwise
correct response. Shared by risk_engine.py and triage_agent.py rather than
duplicating this repair logic in both.
"""

import json
import re


def parse_llm_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Repair pass: a backslash in the model's output that isn't part of a
    # valid JSON escape sequence (\", \\, \/, \n, \t, \r, \b, \f, \uXXXX)
    # is almost always a raw path/name character the model forgot to escape
    # — double it so it parses as a literal backslash instead of breaking
    # the string.
    repaired = re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", text)
    return json.loads(repaired)
