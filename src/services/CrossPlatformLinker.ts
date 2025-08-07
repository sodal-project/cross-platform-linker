/**
 * Cross-Platform Person Linking Service
 * 
 * Intelligently links the same person across GitHub and Bluesky platforms
 * using confidence-scored verification and graph analysis
 */

import { BrainyData } from '@soulcraft/brainy'

export interface LinkCandidate {
  candidate: any
  searchQuery: string
  initialConfidence: number
}

export interface LinkScore {
  confidence: number
  breakdown: {
    exactMatches: number
    heuristicMatches: number
    graphMatches: number
    temporalMatches: number
  }
  reasoning: string[]
}

export interface LinkEvidence {
  nameMatch: { similarity: number, exact: boolean }
  handleSimilarity: { similarity: number, normalized: boolean }
  bioSimilarity: { similarity: number, keywordOverlap: string[] }
  skillOverlap: { overlap: number, commonSkills: string[] }
  locationConsistency: { match: boolean, confidence: number }
  activityCorrelation: { correlation: number, patterns: string[] }
  mutualConnections: { count: number, connections: any[] }
}

export class CrossPlatformLinker {
  private brainyDB: BrainyData
  private linkCache = new Map<string, LinkScore>()
  private logger: any

  constructor(brainyDB: BrainyData, logger: any) {
    this.brainyDB = brainyDB
    this.logger = logger
  }

  /**
   * Find potential cross-platform matches for a person
   */
  async findCandidateMatches(person: any): Promise<LinkCandidate[]> {
    const candidates: LinkCandidate[] = []
    const metadata = person.metadata || {}
    const properties = metadata.properties || {}
    const enhanced = metadata.enhanced || {}
    
    // Generate search queries based on person's attributes
    const searchQueries = this.generateSearchQueries(person)
    
    this.logger.info(`Searching for cross-platform matches using ${searchQueries.length} queries`, {
      personId: person.id,
      platform: metadata.platform
    })
    
    for (const query of searchQueries) {
      try {
        const results = await this.brainyDB.searchText(query, 15)
        const filtered = results.filter(r => 
          r.metadata?.platform !== metadata.platform && // Different platform
          this.isPerson(r) && // Is a person
          !this.alreadyLinked(person.id, r.id) // Not already linked
        )
        
        candidates.push(...filtered.map(r => ({ 
          candidate: r, 
          searchQuery: query,
          initialConfidence: r.score || 0
        })))
      } catch (error) {
        this.logger.warn(`Failed to search for cross-platform matches with query: ${query}`, error)
      }
    }
    
    return this.deduplicateCandidates(candidates)
  }

  /**
   * Generate strategic search queries for finding cross-platform matches
   */
  private generateSearchQueries(person: any): string[] {
    const metadata = person.metadata || {}
    const properties = metadata.properties || {}
    const enhanced = metadata.enhanced || {}
    const identity = enhanced.identity || {}
    
    const queries: string[] = []
    
    // Name-based queries
    const name = properties.name || metadata.name || identity.professionalBranding?.brandName
    if (name) {
      queries.push(`"${name}"`)
      // Split compound names
      const nameParts = name.split(/\s+/).filter((part: string) => part.length > 2)
      if (nameParts.length > 1) {
        queries.push(`"${nameParts[0]}" "${nameParts[nameParts.length - 1]}"`)
      }
    }
    
    // Handle-based queries (without platform suffix)
    const handle = properties.login || properties.handle || metadata.handle
    if (handle) {
      const cleanHandle = handle.replace(/\.(bsky\.social|github\.io)$/, '')
      queries.push(`"${cleanHandle}"`)
      queries.push(`@${cleanHandle}`)
    }
    
    // Email-based queries (if available in bio)
    const bio = properties.bio || metadata.bio || metadata.description || ''
    const emailMatch = bio.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
    if (emailMatch) {
      queries.push(`"${emailMatch[0]}"`)
    }
    
    // Website-based queries
    const website = properties.blog || properties.website || identity.professionalBranding?.websiteUrl
    if (website) {
      const domain = website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
      queries.push(`"${domain}"`)
    }
    
    // Unique bio phrases (for bio similarity matching)
    if (bio.length > 20) {
      const uniquePhrases = this.extractUniquePhrases(bio)
      queries.push(...uniquePhrases.slice(0, 2))
    }
    
    // Company + role combination
    const company = properties.company || metadata.company
    const title = properties.title || metadata.title
    if (company && title) {
      queries.push(`"${company}" "${title}"`)
    }
    
    return queries.filter((query, index, self) => self.indexOf(query) === index) // Deduplicate
  }

  /**
   * Score the confidence of linking two people across platforms
   */
  async scoreLinkConfidence(personA: any, personB: any): Promise<LinkScore> {
    const cacheKey = `${personA.id}:${personB.id}`
    if (this.linkCache.has(cacheKey)) {
      return this.linkCache.get(cacheKey)!
    }

    this.logger.debug('Scoring cross-platform link confidence', {
      personA: personA.id,
      personB: personB.id,
      platformA: personA.metadata?.platform,
      platformB: personB.metadata?.platform
    })

    const scores = {
      exactMatches: await this.scoreExactMatches(personA, personB),
      heuristicMatches: await this.scoreHeuristicMatches(personA, personB), 
      graphMatches: await this.scoreGraphMatches(personA, personB),
      temporalMatches: await this.scoreTemporalMatches(personA, personB)
    }
    
    // Weighted combination favoring exact matches
    const totalConfidence = 
      scores.exactMatches * 0.4 +
      scores.heuristicMatches * 0.25 +
      scores.graphMatches * 0.25 +
      scores.temporalMatches * 0.1
      
    const linkScore: LinkScore = {
      confidence: Math.min(totalConfidence, 1.0),
      breakdown: scores,
      reasoning: this.generateReasoningExplanation(scores)
    }

    this.linkCache.set(cacheKey, linkScore)
    return linkScore
  }

  /**
   * Score exact matches (email, website, explicit links)
   */
  private async scoreExactMatches(personA: any, personB: any): Promise<number> {
    let score = 0
    const propsA = personA.metadata?.properties || {}
    const propsB = personB.metadata?.properties || {}
    const enhancedA = personA.metadata?.enhanced || {}
    const enhancedB = personB.metadata?.enhanced || {}
    
    // Email match (highest confidence)
    const emailA = this.extractEmail(propsA.bio || propsA.description || '')
    const emailB = this.extractEmail(propsB.bio || propsB.description || '')
    if (emailA && emailB && emailA.toLowerCase() === emailB.toLowerCase()) {
      score += 0.9
    }
    
    // Website match
    const websiteA = propsA.blog || propsA.website || enhancedA.identity?.professionalBranding?.websiteUrl
    const websiteB = propsB.blog || propsB.website || enhancedB.identity?.professionalBranding?.websiteUrl
    if (websiteA && websiteB && this.normalizeUrl(websiteA) === this.normalizeUrl(websiteB)) {
      score += 0.8
    }
    
    // Explicit cross-platform links in bio
    const bioA = (propsA.bio || propsA.description || '').toLowerCase()
    const bioB = (propsB.bio || propsB.description || '').toLowerCase()
    const handleA = propsA.login || propsA.handle
    const handleB = propsB.login || propsB.handle
    
    if (handleA && bioB.includes(handleA.toLowerCase())) score += 0.7
    if (handleB && bioA.includes(handleB.toLowerCase())) score += 0.7
    
    return Math.min(score, 1.0)
  }

  /**
   * Score heuristic matches (name, bio, skills, location similarity)
   */
  private async scoreHeuristicMatches(personA: any, personB: any): Promise<number> {
    let score = 0
    const propsA = personA.metadata?.properties || {}
    const propsB = personB.metadata?.properties || {}
    const enhancedA = personA.metadata?.enhanced || {}
    const enhancedB = personB.metadata?.enhanced || {}
    
    // Name similarity
    const nameA = propsA.name || personA.metadata?.name || enhancedA.identity?.professionalBranding?.brandName || ''
    const nameB = propsB.name || personB.metadata?.name || enhancedB.identity?.professionalBranding?.brandName || ''
    if (nameA && nameB) {
      const nameSimilarity = this.calculateStringSimilarity(nameA, nameB)
      if (nameSimilarity > 0.8) score += 0.3
      else if (nameSimilarity > 0.6) score += 0.15
    }
    
    // Handle similarity (without platform suffixes)
    const handleA = (propsA.login || propsA.handle || '').replace(/\.(bsky\.social|github\.io)$/, '')
    const handleB = (propsB.login || propsB.handle || '').replace(/\.(bsky\.social|github\.io)$/, '')
    if (handleA && handleB) {
      if (handleA.toLowerCase() === handleB.toLowerCase()) score += 0.4
      else if (this.calculateStringSimilarity(handleA, handleB) > 0.7) score += 0.2
    }
    
    // Bio similarity
    const bioA = propsA.bio || propsA.description || ''
    const bioB = propsB.bio || propsB.description || ''
    if (bioA && bioB && bioA.length > 20 && bioB.length > 20) {
      const bioSimilarity = this.calculateStringSimilarity(bioA, bioB)
      if (bioSimilarity > 0.5) score += 0.2
    }
    
    // Skills overlap
    const skillsA = enhancedA.skills?.skills || []
    const skillsB = enhancedB.skills?.skills || []
    if (skillsA.length > 0 && skillsB.length > 0) {
      const skillOverlap = this.calculateSkillOverlap(skillsA, skillsB)
      if (skillOverlap > 0.3) score += 0.15
    }
    
    // Location consistency
    const locationA = propsA.location || enhancedA.location?.location?.city || ''
    const locationB = propsB.location || enhancedB.location?.location?.city || ''
    if (locationA && locationB && this.normalizeLocation(locationA) === this.normalizeLocation(locationB)) {
      score += 0.1
    }
    
    return Math.min(score, 1.0)
  }

  /**
   * Score graph-based matches (mutual connections, repository patterns)
   */
  private async scoreGraphMatches(personA: any, personB: any): Promise<number> {
    let score = 0
    
    try {
      // Find mutual connections through follows/following relationships
      const [verbsA, verbsB] = await Promise.all([
        this.brainyDB.getVerbsBySource(personA.id),
        this.brainyDB.getVerbsBySource(personB.id)
      ])
      
      // Find mutual follows
      const followsA = verbsA.filter(v => v.type === 'follows').map(v => v.targetId)
      const followsB = verbsB.filter(v => v.type === 'follows').map(v => v.targetId)
      const mutualFollows = followsA.filter(id => followsB.includes(id))
      
      if (mutualFollows.length > 0) {
        score += Math.min(mutualFollows.length * 0.05, 0.2)
      }
      
      // Repository mention patterns (GitHub user mentioned in Bluesky posts about their repos)
      const repoVerbsA = verbsA.filter(v => v.type === 'owns' && v.targetId.includes('repo'))
      const mentionVerbsB = verbsB.filter(v => v.type === 'posted' || v.type === 'likes')
      
      // Check if person B has interacted with content related to person A's repositories
      for (const repoVerb of repoVerbsA) {
        const repoName = repoVerb.targetId.split('_').pop() // Extract repo name
        for (const mentionVerb of mentionVerbsB) {
          if (mentionVerb.metadata?.text?.toLowerCase().includes(repoName?.toLowerCase() || '')) {
            score += 0.1
            break
          }
        }
      }
    } catch (error) {
      this.logger.warn('Error calculating graph matches', error)
    }
    
    return Math.min(score, 1.0)
  }

  /**
   * Score temporal matches (activity correlation, posting patterns)
   */
  private async scoreTemporalMatches(personA: any, personB: any): Promise<number> {
    let score = 0
    
    try {
      const enhancedA = personA.metadata?.enhanced || {}
      const enhancedB = personB.metadata?.enhanced || {}
      
      // Account creation proximity
      const createdA = enhancedA.activity?.createdAt || personA.metadata?.createdAt
      const createdB = enhancedB.activity?.createdAt || personB.metadata?.createdAt
      
      if (createdA && createdB) {
        const daysDiff = Math.abs(new Date(createdA).getTime() - new Date(createdB).getTime()) / (1000 * 60 * 60 * 24)
        if (daysDiff < 30) score += 0.1 // Accounts created within 30 days
      }
      
      // Activity level correlation
      const activityA = enhancedA.activity?.activityLevel || 'inactive'
      const activityB = enhancedB.activity?.activityLevel || 'inactive'
      
      if (activityA === activityB && activityA !== 'inactive') {
        score += 0.05
      }
      
      // Last active correlation
      const lastActiveA = enhancedA.activity?.lastActiveDate
      const lastActiveB = enhancedB.activity?.lastActiveDate
      
      if (lastActiveA && lastActiveB) {
        const daysDiff = Math.abs(new Date(lastActiveA).getTime() - new Date(lastActiveB).getTime()) / (1000 * 60 * 60 * 24)
        if (daysDiff < 7) score += 0.05 // Active within same week
      }
    } catch (error) {
      this.logger.warn('Error calculating temporal matches', error)
    }
    
    return Math.min(score, 1.0)
  }

  /**
   * Create verified cross-platform links
   */
  async createVerifiedLink(personA: any, personB: any, verificationMethod: 'automatic' | 'human' | 'feedback'): Promise<boolean> {
    try {
      // Update both persons' metadata with cross-platform links
      const linkA = {
        platform: personB.metadata?.platform || 'unknown',
        id: personB.id,
        handle: personB.metadata?.properties?.login || personB.metadata?.properties?.handle,
        verified: verificationMethod === 'human',
        verificationDate: new Date().toISOString(),
        verificationMethod
      }
      
      const linkB = {
        platform: personA.metadata?.platform || 'unknown', 
        id: personA.id,
        handle: personA.metadata?.properties?.login || personA.metadata?.properties?.handle,
        verified: verificationMethod === 'human',
        verificationDate: new Date().toISOString(),
        verificationMethod
      }
      
      // Add alternateIds to both persons (would need metadata update mechanism)
      this.logger.info('Created cross-platform link', {
        personA: personA.id,
        personB: personB.id,
        method: verificationMethod
      })
      
      return true
    } catch (error) {
      this.logger.error('Failed to create cross-platform link', error)
      return false
    }
  }

  // Helper methods
  private isPerson(result: any): boolean {
    const metadata = result.metadata || {}
    const nounType = result.nounType || metadata.nounType || metadata.noun || metadata.type
    return nounType === 'Person' || 
           metadata.entityType === 'user' || 
           metadata.entityType === 'person'
  }

  private alreadyLinked(idA: string, idB: string): boolean {
    // Would check existing cross-platform links
    return false
  }

  private deduplicateCandidates(candidates: LinkCandidate[]): LinkCandidate[] {
    const seen = new Set<string>()
    return candidates.filter(candidate => {
      if (seen.has(candidate.candidate.id)) return false
      seen.add(candidate.candidate.id)
      return true
    })
  }

  private extractEmail(text: string): string | null {
    const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
    return match ? match[0] : null
  }

  private normalizeUrl(url: string): string {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase()
  }

  private normalizeLocation(location: string): string {
    return location.toLowerCase().replace(/[,\s]+/g, ' ').trim()
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const maxLen = Math.max(str1.length, str2.length)
    if (maxLen === 0) return 1
    
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
    return 1 - (distance / maxLen)
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        )
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  private calculateSkillOverlap(skillsA: any[], skillsB: any[]): number {
    const skillSetA = new Set(skillsA.map(skill => 
      (typeof skill === 'string' ? skill : skill.name || '').toLowerCase()
    ))
    const skillSetB = new Set(skillsB.map(skill => 
      (typeof skill === 'string' ? skill : skill.name || '').toLowerCase()
    ))
    
    const intersection = new Set([...skillSetA].filter(x => skillSetB.has(x)))
    const union = new Set([...skillSetA, ...skillSetB])
    
    return union.size > 0 ? intersection.size / union.size : 0
  }

  private extractUniquePhrases(bio: string): string[] {
    // Extract unique phrases from bio that are likely to be distinctive
    const sentences = bio.split(/[.!?]+/).filter(s => s.trim().length > 10)
    return sentences.map(s => s.trim()).slice(0, 3)
  }

  private generateReasoningExplanation(scores: any): string[] {
    const reasoning: string[] = []
    
    if (scores.exactMatches > 0.5) reasoning.push('Strong exact matches found')
    if (scores.heuristicMatches > 0.4) reasoning.push('High similarity in profile details')
    if (scores.graphMatches > 0.2) reasoning.push('Shared connections or interactions')
    if (scores.temporalMatches > 0.1) reasoning.push('Correlated activity patterns')
    
    if (reasoning.length === 0) reasoning.push('Low confidence - limited matching signals')
    
    return reasoning
  }
}