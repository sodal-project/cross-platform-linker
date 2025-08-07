/**
 * Cross-Platform Linker Service
 * 
 * Dedicated service for linking people across GitHub and Bluesky platforms
 * Optimized for background processing without impacting search performance
 */

import express from 'express'
import { BrainyData } from '@soulcraft/brainy'
import { CrossPlatformLinkingAugmentation } from './augmentations/CrossPlatformLinkingAugmentation.js'

// Simple logger
const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta || '')
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta || '')
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta || '')
  },
  debug: (message: string, meta?: any) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta || '')
    }
  }
}

interface ServiceConfig {
  port: number
  logLevel: string
  brainyConfig: any
}

class CrossPlatformLinkerService {
  private app: express.Application
  private brainyDB: BrainyData | null = null
  private augmentation: CrossPlatformLinkingAugmentation | null = null
  private config: ServiceConfig

  constructor() {
    this.app = express()
    this.config = this.loadConfiguration()
    this.setupExpressApp()
  }

  private loadConfiguration(): ServiceConfig {
    const port = parseInt(process.env.PORT || '8080', 10)
    const logLevel = process.env.LOG_LEVEL || 'info'

    // Build Brainy configuration for write-optimized processing
    const brainyConfig: any = {
      defaultService: 'cross-platform-linker',
      readOnly: false, // Write mode for enrichment
      
      // Write optimizations
      distributed: {
        enabled: true,
        role: 'writer',
        nodeId: `cross-platform-linker-${Date.now()}`,
        coordinationBackend: process.env.GCS_ACCESS_KEY_ID ? 's3' : 'local'
      },

      // Enhanced v0.49.0 write optimizations
      statistics: {
        trackPerService: true,
        serviceMetrics: true,
        writeMetrics: true
      },

      // Performance optimizations for write workloads
      batchProcessing: {
        enabled: true,
        batchSize: 50,
        flushInterval: 3000
      },

      // Embedding configuration
      embedding: {
        type: 'transformers',
        model: 'all-MiniLM-L6-v2'
      }
    }

    // Add storage configuration if available
    if (process.env.GCS_ACCESS_KEY_ID && process.env.GCS_SECRET_ACCESS_KEY && process.env.GCS_BUCKET_NAME) {
      brainyConfig.storage = {
        gcsStorage: {
          accessKeyId: process.env.GCS_ACCESS_KEY_ID,
          secretAccessKey: process.env.GCS_SECRET_ACCESS_KEY,
          bucketName: process.env.GCS_BUCKET_NAME,
          endpoint: process.env.GCS_ENDPOINT || 'https://storage.googleapis.com'
        }
      }
      logger.info('Using Google Cloud Storage for Brainy data')
    } else {
      logger.info('Using local storage for Brainy data')
    }

    return {
      port,
      logLevel,
      brainyConfig
    }
  }

  private setupExpressApp() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const status: any = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'cross-platform-linker',
        version: '1.0.0',
        brainyInitialized: !!this.brainyDB,
        augmentationRunning: !!this.augmentation
      }
      
      if (this.augmentation) {
        status.stats = this.augmentation.getStats()
      }
      
      res.json(status)
    })

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const metrics = {
        service: 'cross-platform-linker',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        stats: this.augmentation ? this.augmentation.getStats() : null
      }
      
      res.json(metrics)
    })

    // Manual trigger endpoint (for testing)
    this.app.post('/trigger-linking', async (req, res) => {
      if (!this.augmentation) {
        return res.status(503).json({ error: 'Service not initialized' })
      }

      try {
        logger.info('Manual cross-platform linking triggered')
        // The augmentation runs in background, so we just acknowledge the request
        res.json({ 
          message: 'Cross-platform linking process triggered',
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        logger.error('Failed to trigger linking:', error)
        res.status(500).json({ error: 'Failed to trigger linking' })
      }
    })

    // Graceful shutdown endpoint
    this.app.post('/shutdown', async (req, res) => {
      logger.info('Graceful shutdown requested')
      res.json({ message: 'Shutdown initiated' })
      
      setTimeout(() => {
        this.shutdown()
      }, 1000)
    })
  }

  async initialize() {
    logger.info('Initializing Cross-Platform Linker Service')

    try {
      // Initialize Brainy database
      logger.info('Initializing Brainy database...')
      this.brainyDB = new BrainyData(this.config.brainyConfig)
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      logger.info('Brainy database initialized successfully')

      // Initialize cross-platform linking augmentation
      logger.info('Initializing cross-platform linking augmentation...')
      this.augmentation = new CrossPlatformLinkingAugmentation(this.brainyDB, logger)
      
      logger.info('Cross-platform linking augmentation initialized successfully')
      
      // Add augmentation to Brainy (if supported)
      if (typeof (this.brainyDB as any).addAugmentation === 'function') {
        (this.brainyDB as any).addAugmentation(this.augmentation)
        logger.info('Augmentation added to Brainy pipeline')
      }

      logger.info('Cross-Platform Linker Service initialized successfully')
      
    } catch (error) {
      logger.error('Failed to initialize service:', error)
      throw error
    }
  }

  async start() {
    await this.initialize()
    
    this.app.listen(this.config.port, () => {
      logger.info(`Cross-Platform Linker Service listening on port ${this.config.port}`)
      logger.info('Service endpoints:')
      logger.info(`  - Health: http://localhost:${this.config.port}/health`)
      logger.info(`  - Metrics: http://localhost:${this.config.port}/metrics`)
      logger.info(`  - Manual Trigger: POST http://localhost:${this.config.port}/trigger-linking`)
    })

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown())
    process.on('SIGINT', () => this.shutdown())
  }

  private async shutdown() {
    logger.info('Shutting down Cross-Platform Linker Service...')
    
    try {
      if (this.augmentation) {
        await this.augmentation.cleanup()
      }
      
      if (this.brainyDB && typeof (this.brainyDB as any).close === 'function') {
        await (this.brainyDB as any).close()
      }
      
      logger.info('Service shutdown complete')
      process.exit(0)
    } catch (error) {
      logger.error('Error during shutdown:', error)
      process.exit(1)
    }
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new CrossPlatformLinkerService()
  service.start().catch(error => {
    logger.error('Failed to start service:', error)
    process.exit(1)
  })
}

export { CrossPlatformLinkerService }