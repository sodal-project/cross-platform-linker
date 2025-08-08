/**
 * Cross-Platform Linking Augmentation for Dedicated Linking Service
 * 
 * Links the same person across GitHub, Bluesky, and future platforms
 * Optimized for background processing in a dedicated service
 */

import { AugmentationType } from '@soulcraft/brainy'
import { CrossPlatformLinker } from '../services/CrossPlatformLinker.js'

export class CrossPlatformLinkingAugmentation {
  readonly name = 'cross-platform-linking'
  readonly description = 'Links users across GitHub and Bluesky platforms'
  readonly type = AugmentationType.COGNITION
  readonly priority = 100 // Run after other enrichments
  enabled = true

  private linker: CrossPlatformLinker
  private processedPersons = new Set<string>()
  private lastProcessedTime = new Date()
  private linkingEnabled: boolean
  private logger: any
  private brainyDB: any
  
  // Storage throttling state
  private storageThrottleState = {
    isThrottled: false,
    lastThrottleCheck: 0,
    checkInterval: 60000, // Check every minute
    backoffMs: 1000,
    maxBackoffMs: 60000
  }

  constructor(brainyDB: any, logger: any) {
    this.logger = logger
    this.brainyDB = brainyDB
    this.linker = new CrossPlatformLinker(brainyDB, logger)
    
    // Always enabled in dedicated service
    this.linkingEnabled = true
    
    this.logger.info('Cross-platform linking augmentation enabled (dedicated service)')
    
    // Start intelligent background processing
    this.startSmartBackgroundProcessing()
  }
  
  /**
   * Start intelligent background processing with performance optimizations
   */
  private startSmartBackgroundProcessing() {
    // Adaptive interval: start slow, speed up when there's activity
    let processingInterval = 30000 // Start with 30 seconds for dedicated service
    let consecutiveEmptyRuns = 0
    
    const processWithAdaptiveInterval = async () => {
      try {
        const processed = await this.processNewPeopleIntelligently()
        
        if (processed > 0) {
          // Found work - speed up next check
          processingInterval = Math.max(15000, processingInterval - 5000) // Min 15 seconds
          consecutiveEmptyRuns = 0
        } else {
          // No work - slow down checks
          consecutiveEmptyRuns++
          if (consecutiveEmptyRuns >= 3) {
            processingInterval = Math.min(300000, processingInterval + 30000) // Max 5 minutes
          }
        }
        
        setTimeout(processWithAdaptiveInterval, processingInterval)
      } catch (error) {
        this.logger.warn('Background cross-platform processing error:', error)
        // Use default interval on error
        setTimeout(processWithAdaptiveInterval, 60000)
      }
    }
    
    // Start processing
    setTimeout(processWithAdaptiveInterval, 5000) // Wait 5s after startup
    
    this.logger.info('Smart background processing started (adaptive intervals 15s-5m)')
  }
  
  /**
   * Intelligently find and process only new people with performance optimizations
   */
  private async processNewPeopleIntelligently(): Promise<number> {
    const startTime = Date.now()
    let processedCount = 0
    
    try {
      // Check if storage is throttled before processing
      const isThrottled = await this.checkStorageThrottling()
      if (isThrottled) {
        this.logger.debug(`Skipping cross-platform linking due to storage throttling, backoff: ${this.storageThrottleState.backoffMs}ms`)
        return 0
      }
      
      // Performance optimization: Only search if we haven't checked recently
      const timeSinceLastCheck = Date.now() - this.lastProcessedTime.getTime()
      if (timeSinceLastCheck < 15000) { // Less than 15 seconds
        return 0
      }
      
      // Use optimized search with reasonable limits for dedicated service
      const recentPeople = await this.findRecentPeopleOptimized()
      
      if (recentPeople.length === 0) {
        return 0
      }
      
      // Filter to truly new people we haven't processed
      const newPeople = recentPeople.filter(person => 
        !this.processedPersons.has(person.id) &&
        !this.hasExistingCrossPlatformLinks(person) &&
        this.isRecentlyAdded(person)
      )
      
      if (newPeople.length > 0) {
        this.logger.info(`Processing ${newPeople.length} new people for cross-platform linking`)
        
        // Process with higher limits for dedicated service
        const limitedPeople = newPeople.slice(0, 10) // Max 10 people per cycle
        await this.processPeopleBatchOptimized(limitedPeople)
        
        // Track processed people with memory management
        limitedPeople.forEach(person => this.processedPersons.add(person.id))
        this.cleanupProcessedPersonsCache()
        
        processedCount = limitedPeople.length
      }
      
      this.lastProcessedTime = new Date()
      
      const processingTime = Date.now() - startTime
      if (processingTime > 10000) { // Log slow operations
        this.logger.warn(`Slow cross-platform processing: ${processingTime}ms for ${processedCount} people`)
      }
      
      return processedCount
      
    } catch (error) {
      this.logger.warn('Intelligent people processing error:', error)
      return 0
    }
  }
  
  /**
   * Check if storage is currently throttled using Brainy's throttling metrics
   * Returns true if throttled and we should pause processing
   */
  private async checkStorageThrottling(): Promise<boolean> {
    try {
      // Only check periodically to avoid excessive calls
      const now = Date.now()
      if (now - this.storageThrottleState.lastThrottleCheck < this.storageThrottleState.checkInterval) {
        return this.storageThrottleState.isThrottled
      }
      
      this.storageThrottleState.lastThrottleCheck = now
      
      // Get throttling metrics from Brainy
      const stats: any = await this.brainyDB.getStatistics()
      
      if (stats?.throttlingMetrics?.storage) {
        const storageMetrics = stats.throttlingMetrics.storage
        
        // Check if currently throttled
        if (storageMetrics.currentlyThrottled) {
          this.storageThrottleState.isThrottled = true
          
          // Use the backoff time from Brainy if available
          if (storageMetrics.currentBackoffMs > 0) {
            this.storageThrottleState.backoffMs = storageMetrics.currentBackoffMs
          }
          
          this.logger.warn(`⚠️ Storage is throttled. Pausing cross-platform linking. Backoff: ${this.storageThrottleState.backoffMs}ms, Total events: ${storageMetrics.totalThrottleEvents}`)
          return true
        } else {
          // Storage is not throttled
          if (this.storageThrottleState.isThrottled) {
            this.logger.info('✅ Storage throttling cleared. Resuming cross-platform linking')
          }
          this.storageThrottleState.isThrottled = false
          this.storageThrottleState.backoffMs = 1000
        }
      }
      
      return false
    } catch (error) {
      this.logger.error('Error checking storage throttling:', error)
      // On error, assume not throttled to avoid blocking indefinitely
      return false
    }
  }
  
  /**
   * Optimized people search with reasonable result sets for dedicated service
   */
  private async findRecentPeopleOptimized(): Promise<any[]> {
    try {
      // Larger, more comprehensive searches for dedicated service
      const searchPromises = [
        this.linker['brainyDB'].searchText('github_user', 50),
        this.linker['brainyDB'].searchText('bluesky_user', 50),
        this.linker['brainyDB'].searchText('person', 30)
      ]
      
      const searchResults = await Promise.all(searchPromises)
      
      // Quick deduplication using Set
      const uniquePeople = new Map<string, any>()
      
      for (const results of searchResults) {
        for (const result of results) {
          if (this.isPerson(result) && !uniquePeople.has(result.id)) {
            uniquePeople.set(result.id, result)
          }
        }
      }
      
      return Array.from(uniquePeople.values())
      
    } catch (error) {
      this.logger.warn('Error in optimized people search:', error)
      return []
    }
  }
  
  /**
   * Process batch with optimizations for dedicated service
   */
  private async processPeopleBatchOptimized(people: any[]) {
    // Larger batches for dedicated service
    const batchSize = 5
    
    for (let i = 0; i < people.length; i += batchSize) {
      const batch = people.slice(i, i + batchSize)
      
      // Process with longer timeout for thorough analysis
      const batchPromises = batch.map(person => 
        Promise.race([
          this.linkPersonAcrossPlatforms(person),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 30000) // 30s timeout
          )
        ]).catch(error => {
          this.logger.debug(`Failed to link person ${person.id}: ${error.message}`)
          return person // Return unchanged on error
        })
      )
      
      await Promise.all(batchPromises)
      
      // Shorter pause between batches for dedicated service
      if (i + batchSize < people.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  }
  
  /**
   * Clean up processed persons cache to prevent memory leaks
   */
  private cleanupProcessedPersonsCache() {
    // Keep cache size reasonable (max 2000 processed people for dedicated service)
    if (this.processedPersons.size > 2000) {
      // Remove oldest entries (simple approximation)
      const entries = Array.from(this.processedPersons)
      const toKeep = entries.slice(-1500) // Keep most recent 1500
      
      this.processedPersons.clear()
      toKeep.forEach(id => this.processedPersons.add(id))
      
      this.logger.debug('Cleaned up processed persons cache')
    }
  }

  async process(data: any[]): Promise<any[]> {
    if (!this.linkingEnabled) return data

    try {
      // Filter for people entities that haven't been processed yet
      const newPeople = data.filter(item => 
        this.isPerson(item) && 
        !this.processedPersons.has(item.id) &&
        !this.hasExistingCrossPlatformLinks(item)
      )

      if (newPeople.length === 0) {
        return data
      }

      this.logger.info(`Processing ${newPeople.length} people for cross-platform linking`)

      // Process people in larger batches for dedicated service
      const batchSize = 10
      const enrichedPeople: any[] = []

      for (let i = 0; i < newPeople.length; i += batchSize) {
        const batch = newPeople.slice(i, i + batchSize)
        
        const batchResults = await Promise.all(
          batch.map(async person => {
            try {
              return await this.linkPersonAcrossPlatforms(person)
            } catch (error) {
              this.logger.warn(`Failed to link person ${person.id}:`, error)
              return person // Return unchanged if linking fails
            }
          })
        )

        enrichedPeople.push(...batchResults)
        
        // Mark as processed
        batch.forEach(person => this.processedPersons.add(person.id))
        
        // Brief pause between batches
        if (i + batchSize < newPeople.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Replace people in the original data array with enriched versions
      return data.map(item => {
        const enriched = enrichedPeople.find(p => p.id === item.id)
        return enriched || item
      })

    } catch (error) {
      this.logger.error('Cross-platform linking augmentation error:', error)
      return data // Return original data if augmentation fails
    }
  }

  /**
   * Link a person across platforms using the cross-platform linker
   */
  private async linkPersonAcrossPlatforms(person: any): Promise<any> {
    const startTime = Date.now()
    
    // Find potential cross-platform matches
    const candidates = await this.linker.findCandidateMatches(person)
    
    if (candidates.length === 0) {
      this.logger.debug(`No cross-platform candidates found for ${person.id}`)
      return person
    }

    this.logger.debug(`Found ${candidates.length} potential matches for ${person.id}`)

    // Score and evaluate each candidate
    const scoredCandidates = await Promise.all(
      candidates.map(async candidate => {
        const linkScore = await this.linker.scoreLinkConfidence(person, candidate.candidate)
        return {
          ...candidate,
          linkScore
        }
      })
    )

    // Sort by confidence score
    const bestCandidates = scoredCandidates
      .filter(c => c.linkScore.confidence > 0.5) // Minimum confidence threshold
      .sort((a, b) => b.linkScore.confidence - a.linkScore.confidence)

    if (bestCandidates.length === 0) {
      this.logger.debug(`No high-confidence matches found for ${person.id}`)
      return person
    }

    // Create cross-platform links
    const crossPlatformLinks: any[] = []
    let autoLinkedCount = 0
    let queuedForReviewCount = 0

    for (const candidate of bestCandidates.slice(0, 5)) { // Max 5 links per person
      const { confidence } = candidate.linkScore

      if (confidence > 0.9) {
        // High confidence - auto-link
        const linkCreated = await this.linker.createVerifiedLink(
          person, 
          candidate.candidate, 
          'automatic'
        )
        
        if (linkCreated) {
          crossPlatformLinks.push(this.createLinkMetadata(candidate, confidence, 'automatic'))
          autoLinkedCount++
        }
      } else if (confidence > 0.7) {
        // Medium confidence - store for potential future verification
        crossPlatformLinks.push(this.createLinkMetadata(candidate, confidence, 'potential'))
        queuedForReviewCount++
      }
    }

    const processingTime = Date.now() - startTime
    this.logger.info(`Processed cross-platform linking for ${person.id}`, {
      processingTimeMs: processingTime,
      candidatesFound: candidates.length,
      autoLinked: autoLinkedCount,
      queuedForReview: queuedForReviewCount,
      bestConfidence: bestCandidates[0]?.linkScore.confidence || 0
    })

    // Return person enriched with cross-platform links
    return this.enrichPersonWithCrossPlatformData(person, crossPlatformLinks)
  }

  /**
   * Check if person was recently added (last 24 hours)
   */
  private isRecentlyAdded(person: any): boolean {
    try {
      // Check multiple possible timestamp fields
      const timestamps = [
        person.metadata?.createdAt,
        person.metadata?.indexedAt,
        person.metadata?.updatedAt,
        person.metadata?.enhanced?.activity?.lastActiveDate
      ].filter(Boolean)
      
      if (timestamps.length === 0) {
        // If no timestamp, assume it might be recent
        return true
      }
      
      // Check if any timestamp is within last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      
      return timestamps.some(timestamp => {
        const date = new Date(timestamp)
        return date > oneDayAgo
      })
      
    } catch (error) {
      return true // If we can't determine, err on the side of processing
    }
  }

  /**
   * Check if an item is a person
   */
  private isPerson(item: any): boolean {
    const metadata = item.metadata || {}
    const nounType = item.nounType || metadata.nounType || metadata.noun || metadata.type
    
    return nounType === 'Person' || 
           metadata.entityType === 'user' || 
           metadata.entityType === 'person' ||
           // Platform-specific person detection
           (metadata.platform === 'github' && metadata.properties?.login) ||
           (metadata.platform === 'bluesky' && metadata.properties?.handle)
  }

  /**
   * Check if person already has cross-platform links
   */
  private hasExistingCrossPlatformLinks(person: any): boolean {
    const enhanced = person.metadata?.enhanced || {}
    const identity = enhanced.identity || {}
    const alternateIds = identity.alternateIds || []
    
    // Has links if there are alternate IDs for different platforms
    return alternateIds.some((alt: any) => alt.platform !== person.metadata?.platform)
  }

  /**
   * Create metadata for a cross-platform link
   */
  private createLinkMetadata(candidate: any, confidence: number, status: string): any {
    const candidateMetadata = candidate.candidate.metadata || {}
    const candidateProps = candidateMetadata.properties || {}
    
    return {
      platform: candidateMetadata.platform || 'unknown',
      id: candidate.candidate.id,
      handle: candidateProps.login || candidateProps.handle || candidateProps.name,
      displayName: candidateProps.name || candidateProps.displayName,
      verified: status === 'automatic',
      confidence: confidence,
      status: status, // 'automatic', 'potential', 'manual'
      linkingDate: new Date().toISOString(),
      evidence: candidate.linkScore.reasoning
    }
  }

  /**
   * Enrich person with cross-platform linking metadata
   */
  private enrichPersonWithCrossPlatformData(person: any, crossPlatformLinks: any[]): any {
    if (crossPlatformLinks.length === 0) return person

    // Update the enhanced metadata structure
    const enhanced = person.metadata?.enhanced || {}
    const identity = enhanced.identity || {}
    const existingAlternateIds = identity.alternateIds || []

    // Add new cross-platform links to alternateIds
    const newAlternateIds = crossPlatformLinks.map(link => ({
      platform: link.platform,
      id: link.id,
      handle: link.handle,
      displayName: link.displayName,
      verified: link.verified,
      confidence: link.confidence,
      linkingMethod: 'cross-platform-linker-service',
      linkingDate: link.linkingDate,
      evidence: link.evidence
    }))

    // Merge with existing alternate IDs (avoid duplicates)
    const allAlternateIds = [...existingAlternateIds, ...newAlternateIds]
    const uniqueAlternateIds = allAlternateIds.filter((link, index, array) => 
      index === array.findIndex(other => other.platform === link.platform && other.id === link.id)
    )

    return {
      ...person,
      metadata: {
        ...person.metadata,
        enhanced: {
          ...enhanced,
          identity: {
            ...identity,
            alternateIds: uniqueAlternateIds,
            crossPlatformLinked: true,
            crossPlatformLinkingDate: new Date().toISOString(),
            crossPlatformConfidence: Math.max(...crossPlatformLinks.map(l => l.confidence))
          }
        }
      }
    }
  }

  /**
   * Get augmentation statistics
   */
  getStats(): any {
    return {
      name: this.name,
      type: this.type,
      enabled: this.linkingEnabled,
      processedPersons: this.processedPersons.size,
      avgProcessingTime: 'varies', // Could track this
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.processedPersons.clear()
    this.logger.info('Cross-platform linking augmentation cleaned up')
  }
}