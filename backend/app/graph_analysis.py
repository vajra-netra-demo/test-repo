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
