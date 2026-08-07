"""Real access-graph analysis over discovered tools — an in-process
NetworkX substitute for standing up a deployed Neo4j service.

The existing dashboard "Access Graph" panel (static/index.html) is a
hand-drawn Sankey-style SVG: real counts, but no actual graph algorithm
behind it. This module builds a genuine tripartite graph — department
nodes, tool nodes, data-category nodes — and runs real graph metrics
(degree centrality, betweenness centrality, connected components) over
it, so "this tool sits at the center of your access graph" is a computed
claim, not a visual impression.

Deliberately NOT a deployed graph database: NetworkX runs in-process,
recomputed fresh from the current SaaSTool rows on every request. No new
service to deploy, no new failure mode, no infra risk added this close to
the deadline. If real multi-hop traversal queries or persistence across
huge graphs were ever needed, Neo4j would be the right upgrade — for the
graph sizes here (tens to low hundreds of tools), that would be added
complexity with no payoff.
"""

import networkx as nx


def _categorize(raw_strings):
    """Same broad-bucket categorization the dashboard's Access Graph panel
    already uses (static/index.html's CATEGORY_RULES), reimplemented here
    so the backend's real graph and the frontend's illustrative Sankey
    describe the same categories."""
    rules = [
        ("Customer/Personal Data", ["pii", "customer", "contact"]),
        ("Financial Data", ["bank", "invoice", "financial", "salary", "payroll"]),
        ("Email & Communications", ["email", "mail", "message"]),
        ("Source Code", ["source code", "repositor", "contents", "pull_request", "checks", "statuses"]),
        ("Admin/Org Data", ["admin", "organization", "director", "member", "hook"]),
        ("Calendar/Meetings", ["calendar", "meeting"]),
        ("Files & Documents", ["file", "drive", "document"]),
    ]
    buckets = set()
    for s in (raw_strings or []):
        lower = s.lower()
        match = next((label for label, keywords in rules if any(k in lower for k in keywords)), None)
        buckets.add(match or "Other")
    return buckets or {"Other"}


def build_access_graph(tools: list) -> nx.Graph:
    """tools: list of dicts with tool_name/department/data_categories_accessed.
    Builds one undirected graph: dept --- tool --- data-category edges."""
    g = nx.Graph()
    for t in tools:
        tool_node = f"tool::{t['tool_name']}"
        dept_node = f"dept::{t.get('department') or 'Unknown'}"
        g.add_node(tool_node, kind="tool", risk_score=t.get("risk_score"))
        g.add_node(dept_node, kind="department")
        g.add_edge(dept_node, tool_node)
        for cat in _categorize(t.get("data_categories_accessed")):
            cat_node = f"cat::{cat}"
            g.add_node(cat_node, kind="data_category")
            g.add_edge(tool_node, cat_node)
    return g


def compute_graph_insights(tools: list, top_n: int = 5) -> dict:
    """Real, computed graph metrics — not illustrative. Returns:
    - node/edge counts and connected-component count for the whole graph
    - the top_n tools by degree centrality (how many distinct departments +
      data categories a tool touches — its "blast radius")
    - the top_n tools by betweenness centrality (how often a tool sits on
      the shortest path between two other nodes — a structural bridge,
      e.g. a tool that's the only link between a department and a data
      category no other tool in that department touches)
    """
    g = build_access_graph(tools)
    if g.number_of_nodes() == 0:
        return {
            "node_count": 0, "edge_count": 0, "connected_components": 0,
            "most_central_tools": [], "bridge_tools": [],
        }

    degree_centrality = nx.degree_centrality(g)
    betweenness = nx.betweenness_centrality(g)
    components = list(nx.connected_components(g))

    tool_nodes = [n for n, d in g.nodes(data=True) if d.get("kind") == "tool"]

    def _tool_summary(node, score_map):
        name = node.replace("tool::", "", 1)
        return {
            "tool_name": name,
            "score": round(score_map[node], 4),
            "risk_score": g.nodes[node].get("risk_score"),
            "departments_and_categories_touched": g.degree(node),
        }

    most_central = sorted(
        (_tool_summary(n, degree_centrality) for n in tool_nodes),
        key=lambda x: x["score"], reverse=True,
    )[:top_n]

    bridge_tools = sorted(
        (_tool_summary(n, betweenness) for n in tool_nodes),
        key=lambda x: x["score"], reverse=True,
    )[:top_n]

    return {
        "node_count": g.number_of_nodes(),
        "edge_count": g.number_of_edges(),
        "connected_components": len(components),
        "largest_component_size": max((len(c) for c in components), default=0),
        "most_central_tools": most_central,
        "bridge_tools": bridge_tools,
    }


HIGH_RISK_THRESHOLD = 70  # matches scan_pipeline.py's own threshold


def compute_attack_paths(tools: list, top_n: int = 15) -> dict:
    """Real 2-hop graph traversal over the same access graph
    build_access_graph() builds — from each High-risk tool, follows its
    real department/data-category edges to find other tools that share
    that same department or data-category bucket.

    This is deliberately NOT an attack simulation: it runs nothing,
    executes no adversary behavior, sends no traffic — same line
    app/attack_mapping.py's docstring already draws (the team explicitly
    walked back an earlier "attack-simulation" framing for having no
    connection to NETRA's actual discovery/governance thesis). This is a
    structural-reachability explanation: "if this already-discovered
    High-risk tool were compromised, here's what it's actually connected
    to via a real shared department or data category" — every edge in
    the path is a real fact about real discovered tools, not a modeled
    or invented adversary action.

    A department-shared path is ranked above a data-category-shared one:
    sharing a department means the same team's actual operating
    environment, a materially stronger lateral-movement signal than two
    tools merely touching the same broad category of data.
    """
    g = build_access_graph(tools)
    if g.number_of_nodes() == 0:
        return {"high_risk_source_count": 0, "paths": [], "total_paths_found": 0}

    high_risk_nodes = [
        n for n, d in g.nodes(data=True)
        if d.get("kind") == "tool" and (d.get("risk_score") or 0) >= HIGH_RISK_THRESHOLD
    ]

    paths = []
    seen = set()
    for source in high_risk_nodes:
        for mid in g.neighbors(source):
            mid_kind = g.nodes[mid]["kind"]
            # "Other" is the catch-all bucket for data that didn't match any
            # specific category keyword (see _categorize above) -- it
            # typically covers most of the org's tools, so two tools both
            # landing in "Other" share nothing meaningful, not a real
            # lateral-movement signal. Without this exclusion a handful of
            # High-risk tools fan out into tens of thousands of "paths"
            # through that one uninformative bucket, drowning out the real
            # department/specific-category signal entirely.
            if mid_kind == "data_category" and mid.split("::", 1)[1] == "Other":
                continue
            for target in g.neighbors(mid):
                if target == source or g.nodes[target].get("kind") != "tool":
                    continue
                # Keyed on the unordered {source, target} pair *and* the
                # connecting node, so a pair sharing both a department AND
                # a data category yields two distinct, real paths rather
                # than being collapsed into one or duplicated when the
                # target is itself later processed as its own source.
                key = (frozenset((source, target)), mid)
                if key in seen:
                    continue
                seen.add(key)
                paths.append({
                    "from_tool": source.replace("tool::", "", 1),
                    "from_risk_score": g.nodes[source].get("risk_score"),
                    "to_tool": target.replace("tool::", "", 1),
                    "to_risk_score": g.nodes[target].get("risk_score"),
                    "via_kind": "department" if mid_kind == "department" else "data_category",
                    "via_name": mid.split("::", 1)[1],
                })

    paths.sort(key=lambda p: (p["via_kind"] != "department", -(p["to_risk_score"] or 0)))

    return {
        "high_risk_source_count": len(high_risk_nodes),
        "paths": paths[:top_n],
        "total_paths_found": len(paths),
    }
