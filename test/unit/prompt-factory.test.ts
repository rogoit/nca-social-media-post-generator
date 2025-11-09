import { describe, it, expect } from 'vitest';
import { PromptFactory } from '../../src/utils/prompt-factory.js';

describe('PromptFactory', () => {
  const testTranscript = 'This is a test transcript for social media content generation.';

  describe('createPrompt', () => {
    it('should create YouTube prompt without optional parameters', () => {
      const prompt = PromptFactory.createPrompt('youtube', testTranscript);

      expect(prompt).toContain('YouTube-Content-Optimierungsassistent');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('Never Code Alone (nicht nevercodealone, never code alone oder NeverCodeAlone)');
      expect(prompt).toContain('TRANSCRIPT:');
      expect(prompt).toContain('TITLE:');
      expect(prompt).toContain('DESCRIPTION:');
    });

    it('should create YouTube prompt with video duration', () => {
      const prompt = PromptFactory.createPrompt('youtube', testTranscript, { videoDuration: '7:16' });
      
      expect(prompt).toContain('Video-Dauer: 7:16');
      expect(prompt).toContain('TIMESTAMPS:');
      expect(prompt).toContain('GENAU 5 Zeitstempel');
    });

    it('should create YouTube prompt with keywords', () => {
      const keywords = ['JavaScript', 'React', 'TypeScript'];
      const prompt = PromptFactory.createPrompt('youtube', testTranscript, { keywords });
      
      expect(prompt).toContain('PRIORITÄT-KEYWORDS');
      expect(prompt).toContain('JavaScript, React, TypeScript');
    });

    it('should create YouTube prompt with both duration and keywords', () => {
      const options = {
        videoDuration: '5:30',
        keywords: ['Vue.js', 'Vite']
      };
      const prompt = PromptFactory.createPrompt('youtube', testTranscript, options);
      
      expect(prompt).toContain('Video-Dauer: 5:30');
      expect(prompt).toContain('Vue.js, Vite');
      expect(prompt).toContain('TIMESTAMPS:');
    });

    it('should create LinkedIn prompt', () => {
      const prompt = PromptFactory.createPrompt('linkedin', testTranscript);
      
      expect(prompt).toContain('LinkedIn-Content-Optimierungsassistent');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('LINKEDIN POST:');
      expect(prompt).toContain('1000-1500 Zeichen');
    });

    it('should create LinkedIn prompt with keywords', () => {
      const keywords = ['Node.js', 'Express'];
      const prompt = PromptFactory.createPrompt('linkedin', testTranscript, { keywords });
      
      expect(prompt).toContain('PRIORITÄT-KEYWORDS');
      expect(prompt).toContain('Node.js, Express');
    });

    it('should create Twitter prompt', () => {
      const prompt = PromptFactory.createPrompt('twitter', testTranscript);
      
      expect(prompt).toContain('Twitter-Content-Optimierungsassistent');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('TWITTER POST:');
      expect(prompt).toContain('280 Zeichen');
    });

    it('should create Instagram prompt', () => {
      const prompt = PromptFactory.createPrompt('instagram', testTranscript);
      
      expect(prompt).toContain('Instagram-Content-Optimierungsassistent');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('INSTAGRAM POST:');
      expect(prompt).toContain('#nca #duisburg #ncatestify');
      expect(prompt).toContain('500-800 Zeichen');
    });

    it('should create TikTok prompt', () => {
      const prompt = PromptFactory.createPrompt('tiktok', testTranscript);
      
      expect(prompt).toContain('TikTok-Content-Optimierungsassistent');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('TIKTOK POST:');
      expect(prompt).toContain('150-300 Zeichen');
    });

    it('should create TikTok prompt with keywords', () => {
      const keywords = ['PHP', 'Laravel'];
      const prompt = PromptFactory.createPrompt('tiktok', testTranscript, { keywords });
      
      expect(prompt).toContain('PRIORITÄT-KEYWORDS');
      expect(prompt).toContain('PHP, Laravel');
    });

    it('should create keywords prompt', () => {
      const prompt = PromptFactory.createPrompt('keywords', testTranscript);
      
      expect(prompt).toContain('SEO-Keyword-Extraktion');
      expect(prompt).toContain(testTranscript);
      expect(prompt).toContain('KEYWORDS:');
      expect(prompt).toContain('3 wichtigsten Keywords');
    });

    it('should throw error for unsupported platform type', () => {
      expect(() => {
        PromptFactory.createPrompt('unsupported' as any, testTranscript);
      }).toThrow('Unsupported platform type: unsupported');
    });

    it('should include brand name guidelines in all prompts', () => {
      const platforms = ['youtube', 'linkedin', 'twitter', 'instagram', 'tiktok', 'keywords'] as const;

      platforms.forEach(platform => {
        const prompt = PromptFactory.createPrompt(platform, testTranscript);
        expect(prompt).toContain('Never Code Alone (nicht nevercodealone, never code alone oder NeverCodeAlone)');
        expect(prompt).toContain('Roland Golla');
        expect(prompt).toContain('JavaScript (nicht Javascript oder javascript)');
      });
    });

    it('should include anti-exaggeration guidelines in social media prompts', () => {
      const socialPlatforms = ['youtube', 'linkedin', 'twitter', 'instagram', 'tiktok'] as const;
      
      socialPlatforms.forEach(platform => {
        const prompt = PromptFactory.createPrompt(platform, testTranscript);
        expect(prompt).toContain('KEINE übertriebenen Wörter');
        expect(prompt).toContain('revolutionär');
        expect(prompt).toContain('sachlich und präzise');
      });
    });

    it('should include informal address guidelines in social media prompts', () => {
      const socialPlatforms = ['youtube', 'linkedin', 'twitter', 'instagram', 'tiktok'] as const;
      
      socialPlatforms.forEach(platform => {
        const prompt = PromptFactory.createPrompt(platform, testTranscript);
        expect(prompt).toContain('informelle Anrede');
        expect(prompt).toContain('ihr/euch/eure');
        expect(prompt).toContain('lockeren, direkten Ton');
      });
    });
  });
});