// =====================================================
// OCR PROVIDER ADAPTER (STUB IMPLEMENTATION)
// =====================================================
// Provides OCR processing and system recommendation logic for verification
// TODO: Replace with real OCR provider (Google Vision, AWS Textract, etc.)

export interface OCRResult {
  extractedText: string;
  extractedJson: {
    candidate_name?: string;
    exam_type?: string;
    year?: string;
    subjects?: Array<{ name: string; grade: string }>;
  };
  confidenceScore: number;
}

export interface SystemRecommendation {
  recommendation: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface TutorProfile {
  id: string;
  full_name: string;
  display_name?: string;
}

export class OCRProvider {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    this.apiKey = process.env.OCR_PROVIDER_API_KEY || 'STUB_MODE';
    this.endpoint = process.env.OCR_PROVIDER_ENDPOINT || 'https://stub.ocr.api';
  }

  /**
   * Process a document with OCR
   * Returns extracted text and structured data
   * 
   * STUB MODE: Returns mock data for development
   * TODO: Replace with real OCR API call
   */
  async processDocument(filePath: string, fileType: 'image' | 'pdf'): Promise<OCRResult> {
    console.log('🔍 OCR Processing (STUB MODE):', { filePath, fileType });

    // Check if we have real API credentials
    if (this.apiKey !== 'STUB_MODE') {
      // TODO: Implement real OCR API call
      // Example structure for Google Cloud Vision:
      // const vision = require('@google-cloud/vision');
      // const client = new vision.ImageAnnotatorClient({
      //   keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      // });
      // const [result] = await client.textDetection(filePath);
      // return this.parseOCRResponse(result);
      console.log('⚠️ Real OCR API not yet implemented');
    }

    // STUB: Return mock OCR results
    await this.delay(1500); // Simulate processing time

    // Generate mock data based on file path (for testing different scenarios)
    const mockScenarios = this.getMockScenario(filePath);
    
    return mockScenarios;
  }

  /**
   * Generate system recommendation based on OCR results and tutor profile
   * This implements the business logic for APPROVE/REJECT decisions
   */
  generateRecommendation(
    ocrResult: OCRResult,
    tutorProfile: TutorProfile
  ): SystemRecommendation {
    const { extractedText, extractedJson, confidenceScore } = ocrResult;

    // Rule 1: Low confidence or unreadable text
    if (confidenceScore < 60 || !extractedText || extractedText.length < 50) {
      return {
        recommendation: 'REJECT',
        reason: 'Image unclear / unreadable. Please upload a clearer image.'
      };
    }

    // Rule 2: Name mismatch
    if (extractedJson.candidate_name) {
      const similarity = this.calculateNameSimilarity(
        extractedJson.candidate_name,
        tutorProfile.full_name
      );
      
      if (similarity < 0.6) {
        return {
          recommendation: 'REJECT',
          reason: `Name does not match profile. Extracted: "${extractedJson.candidate_name}" vs Profile: "${tutorProfile.full_name}"`
        };
      }
    }

    // Rule 3: No recognizable subjects/grades
    if (!extractedJson.subjects || extractedJson.subjects.length === 0) {
      return {
        recommendation: 'REJECT',
        reason: 'Could not detect subjects/grades. Please ensure the document clearly shows your exam results.'
      };
    }

    // Rule 4: Invalid exam type
    if (extractedJson.exam_type && 
        !['CSEC', 'CAPE', 'GCE', 'SAT'].includes(extractedJson.exam_type.toUpperCase())) {
      return {
        recommendation: 'REJECT',
        reason: 'Exam type not recognized. Accepted: CSEC, CAPE, GCE O-Level, SAT.'
      };
    }

    // All checks passed - recommend approval
    return {
      recommendation: 'APPROVE',
      reason: `Document appears valid. Extracted ${extractedJson.subjects.length} subject(s) with grades. Confidence: ${confidenceScore}%`
    };
  }

  /**
   * Calculate name similarity (simple Levenshtein-based approach)
   * Returns value between 0 and 1 (1 = identical)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    // Normalize names (lowercase, remove extra spaces)
    const n1 = name1.toLowerCase().trim().replace(/\s+/g, ' ');
    const n2 = name2.toLowerCase().trim().replace(/\s+/g, ' ');

    if (n1 === n2) return 1.0;

    // Simple substring check for MVP
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(n1, n2);
    const maxLength = Math.max(n1.length, n2.length);
    
    return 1 - (distance / maxLength);
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * STUB: Generate mock OCR scenarios for testing
   */
  private getMockScenario(filePath: string): OCRResult {
    // Different scenarios based on file path (for testing)
    if (filePath.includes('clear')) {
      return {
        extractedText: 'CARIBBEAN EXAMINATIONS COUNCIL\nCERTIFICATE OF SECONDARY EDUCATION\nCandidate Name: JOHN SMITH\nSubjects:\nMathematics - Grade I\nEnglish Language - Grade II\nChemistry - Grade II\nPhysics - Grade III\nYear: 2023',
        extractedJson: {
          candidate_name: 'John Smith',
          exam_type: 'CSEC',
          year: '2023',
          subjects: [
            { name: 'Mathematics', grade: 'I' },
            { name: 'English Language', grade: 'II' },
            { name: 'Chemistry', grade: 'II' },
            { name: 'Physics', grade: 'III' }
          ]
        },
        confidenceScore: 92
      };
    } else if (filePath.includes('unclear')) {
      return {
        extractedText: 'blurry text... unable to read clearly...',
        extractedJson: {},
        confidenceScore: 35
      };
    } else if (filePath.includes('wrong_name')) {
      return {
        extractedText: 'CSEC Results\nCandidate: Jane Doe\nMathematics - I\nEnglish - II',
        extractedJson: {
          candidate_name: 'Jane Doe',
          exam_type: 'CSEC',
          year: '2023',
          subjects: [
            { name: 'Mathematics', grade: 'I' },
            { name: 'English', grade: 'II' }
          ]
        },
        confidenceScore: 88
      };
    } else {
      // Default good scenario
      return {
        extractedText: 'CARIBBEAN EXAMINATIONS COUNCIL\nCAPE Examination Results\nCandidate Name: SAMPLE TUTOR\nUnit 1 Mathematics - Grade A\nUnit 2 Mathematics - Grade B\nUnit 1 Chemistry - Grade A\nYear: 2022',
        extractedJson: {
          candidate_name: 'Sample Tutor',
          exam_type: 'CAPE',
          year: '2022',
          subjects: [
            { name: 'Mathematics Unit 1', grade: 'A' },
            { name: 'Mathematics Unit 2', grade: 'B' },
            { name: 'Chemistry Unit 1', grade: 'A' }
          ]
        },
        confidenceScore: 87
      };
    }
  }

  /**
   * Helper: Simulate async delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if OCR provider is configured with real credentials
   */
  isConfigured(): boolean {
    return this.apiKey !== 'STUB_MODE';
  }

  /**
   * Get configuration status for debugging
   */
  getConfigStatus(): {
    configured: boolean;
    mode: 'STUB' | 'REAL';
    hasApiKey: boolean;
    endpoint: string;
  } {
    return {
      configured: this.isConfigured(),
      mode: this.isConfigured() ? 'REAL' : 'STUB',
      hasApiKey: this.apiKey !== 'STUB_MODE',
      endpoint: this.endpoint
    };
  }
}

// Export singleton instance
export const ocrProvider = new OCRProvider();







