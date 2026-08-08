#!/bin/bash
# TriNetra — Microsoft Sentinel setup via Azure CLI
# Paste this into your own Cloud Shell (bash) session at portal.azure.com.
# Uses your existing subscription (the one with Foundry already deployed).
# Safe to re-run — each step checks/creates idempotently where possible.

set -euo pipefail

RG="rg-netra-sentinel"
LOCATION="eastus2"
WORKSPACE="netra-mvp-sentinel-ws"
DCE_NAME="netra-mvp-dce"
DCR_NAME="netra-mvp-dcr"
TABLE_NAME="NetraFindings_CL"
APP_NAME="netra-sentinel-ingest"

echo "== 1. Resource group =="
az group create --name "$RG" --location "$LOCATION" --output table

echo "== 2. Log Analytics workspace =="
az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$WORKSPACE" \
  --location "$LOCATION" \
  --output table

WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" --workspace-name "$WORKSPACE" \
  --query id -o tsv)

echo "== 3. Enable Microsoft Sentinel on the workspace =="
az extension add --name security-insights --only-show-errors 2>/dev/null || true
az sentinel onboarding-state create \
  --resource-group "$RG" \
  --workspace-name "$WORKSPACE" \
  --customer-managed-key false \
  --output table || echo "(Sentinel onboarding may need to be done once via the portal UI if this CLI command isn't available in your az version — see: Microsoft Sentinel > + Create > select this workspace)"

echo "== 4. Custom table for TriNetra findings =="
az monitor log-analytics workspace table create \
  --resource-group "$RG" \
  --workspace-name "$WORKSPACE" \
  --name "$TABLE_NAME" \
  --columns TimeGenerated=datetime ToolName=string RiskScore=int RiskFlags=string Tenant=string Source=string \
  --output table

echo "== 5. Data Collection Endpoint =="
az monitor data-collection endpoint create \
  --resource-group "$RG" \
  --name "$DCE_NAME" \
  --location "$LOCATION" \
  --public-network-access Enabled \
  --output table

DCE_ID=$(az monitor data-collection endpoint show \
  --resource-group "$RG" --name "$DCE_NAME" --query id -o tsv)
DCE_INGEST_URL=$(az monitor data-collection endpoint show \
  --resource-group "$RG" --name "$DCE_NAME" --query logsIngestion.endpoint -o tsv)

echo "== 6. Data Collection Rule (routes ingested data to the custom table) =="
cat > dcr-payload.json <<EOF
{
  "location": "$LOCATION",
  "properties": {
    "dataCollectionEndpointId": "$DCE_ID",
    "streamDeclarations": {
      "Custom-$TABLE_NAME": {
        "columns": [
          {"name": "TimeGenerated", "type": "datetime"},
          {"name": "ToolName", "type": "string"},
          {"name": "RiskScore", "type": "int"},
          {"name": "RiskFlags", "type": "string"},
          {"name": "Tenant", "type": "string"},
          {"name": "Source", "type": "string"}
        ]
      }
    },
    "destinations": {
      "logAnalytics": [
        {"workspaceResourceId": "$WORKSPACE_ID", "name": "netraWorkspace"}
      ]
    },
    "dataFlows": [
      {
        "streams": ["Custom-$TABLE_NAME"],
        "destinations": ["netraWorkspace"],
        "outputStream": "Custom-$TABLE_NAME"
      }
    ]
  }
}
EOF

az monitor data-collection rule create \
  --resource-group "$RG" \
  --name "$DCR_NAME" \
  --rule-file dcr-payload.json \
  --output table

DCR_ID=$(az monitor data-collection rule show \
  --resource-group "$RG" --name "$DCR_NAME" --query immutableId -o tsv)

echo "== 7. App registration for authenticating the push connector =="
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID" --only-show-errors >/dev/null
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "== 8. Grant the app 'Monitoring Metrics Publisher' role on the DCR =="
az role assignment create \
  --assignee "$APP_ID" \
  --role "Monitoring Metrics Publisher" \
  --scope "$(az monitor data-collection rule show --resource-group "$RG" --name "$DCR_NAME" --query id -o tsv)" \
  --output table

echo ""
echo "=========================================="
echo "DONE. Add these to netra-mvp/backend/.env and Railway's Variables tab:"
echo ""
echo "SENTINEL_DCE_ENDPOINT=$DCE_INGEST_URL"
echo "SENTINEL_DCR_IMMUTABLE_ID=$DCR_ID"
echo "SENTINEL_STREAM_NAME=Custom-$TABLE_NAME"
echo "SENTINEL_TENANT_ID=$TENANT_ID"
echo "SENTINEL_CLIENT_ID=$APP_ID"
echo "SENTINEL_CLIENT_SECRET=$SECRET"
echo "=========================================="
