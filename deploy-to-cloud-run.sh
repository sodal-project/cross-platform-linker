#!/bin/bash

# Cross-Platform Linker Service Deployment Script
# Deploys to Google Cloud Run with the same configuration as other services

set -e

# Load environment variables
source .env

# Service configuration
SERVICE_NAME="${SERVICE_NAME:-cross-platform-linker}"
PROJECT_ID="${PROJECT_ID:-cartographer-a03db}"
REGION="${REGION:-us-central1}"
PORT="${PORT:-8083}"

echo "🚀 Deploying Cross-Platform Linker Service to Google Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo "   Port: $PORT"

# Build and deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --port $PORT \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 10 \
  --min-instances 1 \
  --max-instances 3 \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "PROJECT_ID=$PROJECT_ID" \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "SERVICE_NAME=$SERVICE_NAME" \
  --set-env-vars "GCS_ENDPOINT=$GCS_ENDPOINT" \
  --set-env-vars "GCS_REGION=$GCS_REGION" \
  --set-env-vars "GCS_ACCESS_KEY_ID=$GCS_ACCESS_KEY_ID" \
  --set-env-vars "GCS_SECRET_ACCESS_KEY=$GCS_SECRET_ACCESS_KEY" \
  --set-env-vars "GCS_BUCKET_NAME=$GCS_BUCKET_NAME" \
  --set-env-vars "PORT=$PORT" \
  --set-env-vars "LOG_LEVEL=info" \
  --set-env-vars "AUTO_START_PROCESSING=true" \
  --set-env-vars "BACKGROUND_PROCESSING_ENABLED=true" \
  --allow-unauthenticated

echo "✅ Deployment completed successfully!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="value(status.url)")

echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo "🔍 Health Check: $SERVICE_URL/health"
echo "📊 Metrics: $SERVICE_URL/metrics"
echo ""
echo "📋 Useful commands:"
echo "   gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo "   gcloud run logs read --service=$SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
echo "🎉 Cross-Platform Linker Service is now running!"