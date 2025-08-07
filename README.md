# Cross-Platform Linker Service

A dedicated microservice for intelligently linking people across GitHub and Bluesky platforms using the Brainy vector database. This service runs independently from scout-search to provide optimal performance for both search and linking operations.

## Overview

The Cross-Platform Linker Service identifies and links the same person across different platforms by analyzing:

- **Exact Matches**: Email addresses, website URLs, explicit cross-references
- **Heuristic Matches**: Name similarity, handle similarity, bio similarity, skill overlap, location consistency
- **Graph Matches**: Mutual connections, shared interactions, repository mention patterns
- **Temporal Matches**: Account creation timing, activity correlation patterns

## Architecture

- **Write-Only Service**: Reads from shared S3 storage, enriches data, writes back
- **Background Processing**: Runs on adaptive intervals (15s-5m) based on activity
- **Zero Configuration**: Auto-detects new people, no manual setup required
- **Performance Optimized**: Dedicated resources without impacting search performance

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start the service
npm start
```

### Docker

```bash
# Build Docker image
docker build -t cross-platform-linker .

# Run container
docker run -p 8083:8083 --env-file .env cross-platform-linker
```

### Google Cloud Run

```bash
# Deploy to Cloud Run
./deploy-to-cloud-run.sh
```

## Configuration

The service uses environment variables for configuration:

```bash
# Google Cloud Storage (shared with other services)
GCS_ACCESS_KEY_ID=your_access_key
GCS_SECRET_ACCESS_KEY=your_secret_key
GCS_BUCKET_NAME=brainy
GCS_ENDPOINT=https://storage.googleapis.com

# Service configuration
PORT=8083
LOG_LEVEL=info
AUTO_START_PROCESSING=true
```

## API Endpoints

### Health Check
```bash
GET /health
```

Returns service status and statistics.

### Metrics
```bash
GET /metrics
```

Returns performance metrics and processing statistics.

### Manual Trigger
```bash
POST /trigger-linking
```

Manually triggers the cross-platform linking process (for testing).

## Linking Algorithm

### 1. Candidate Discovery
- Name-based queries (full name, first+last name)
- Handle-based queries (cleaned of platform suffixes)
- Email extraction from bios
- Website/domain matching
- Unique bio phrase matching

### 2. Confidence Scoring
- **Exact Matches (40% weight)**: Email, website, explicit mentions
- **Heuristic Matches (25% weight)**: Name, handle, bio, skills, location similarity
- **Graph Matches (25% weight)**: Mutual connections, interaction patterns
- **Temporal Matches (10% weight)**: Account timing, activity correlation

### 3. Link Creation
- **High Confidence (>0.9)**: Automatic linking
- **Medium Confidence (0.7-0.9)**: Queued for review
- **Low Confidence (<0.7)**: Ignored

### 4. Data Enrichment
Links are stored in the `metadata.enhanced.identity.alternateIds` structure:

```json
{
  "metadata": {
    "enhanced": {
      "identity": {
        "alternateIds": [
          {
            "platform": "github",
            "id": "github_user_123",
            "handle": "johndoe",
            "verified": true,
            "confidence": 0.95,
            "linkingMethod": "cross-platform-linker-service"
          }
        ]
      }
    }
  }
}
```

## Performance Features

- **Adaptive Processing**: Speeds up when activity detected, slows down when idle
- **Memory Management**: LRU cache cleanup to prevent memory leaks
- **Batch Processing**: Processes multiple people in optimized batches
- **Timeout Protection**: Prevents hanging operations from blocking the service
- **Error Resilience**: Continues processing even if individual links fail

## Monitoring

The service provides comprehensive metrics:

- Processing statistics (people processed, links created)
- Performance metrics (processing time, memory usage)
- Error tracking and logging
- Health check endpoints for load balancer integration

## Integration with Other Services

### Scout-Search
- **Read-Only Mode**: Scout-search reads enriched data with cross-platform links
- **Performance Isolation**: No background processing in scout-search
- **Data Consistency**: Both services use the same S3 storage backend

### GitHub/Bluesky Packages
- **Data Source**: These packages write raw person data
- **Link Enhancement**: Cross-platform-linker enriches the data with connections
- **Confidence Scores**: Leverages the confidence-scored verbs from both packages

## Deployment

The service is designed for cloud deployment with:

- **Google Cloud Run**: Serverless container deployment
- **Shared Storage**: Same GCS bucket as other services
- **Auto-scaling**: Scales based on processing load
- **Health Monitoring**: Built-in health checks and metrics

## Development

### Project Structure

```
src/
├── index.ts                    # Main service entry point
├── services/
│   └── CrossPlatformLinker.ts  # Core linking logic
└── augmentations/
    └── CrossPlatformLinkingAugmentation.ts  # Brainy augmentation
```

### Adding New Platforms

To add support for linking additional platforms:

1. Update candidate discovery queries in `generateSearchQueries()`
2. Add platform-specific matching logic in scoring methods
3. Update the `isPerson()` method for new platform detection
4. Add platform-specific metadata extraction

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Create an issue in this repository
- Check the health endpoint for service status
- Review logs using `gcloud run logs read --service=cross-platform-linker`