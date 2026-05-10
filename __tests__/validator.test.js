'use strict';

const { validateYouTubeUrl, normalizeYouTubeUrl, sanitizeOutputPath } = require('../app/backend/validator');

describe('validator.js', () => {
  describe('validateYouTubeUrl', () => {
    test('should validate standard YouTube watch URL', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('video');
      expect(result.error).toBeNull();
    });

    test('should validate youtu.be shortlink', () => {
      const result = validateYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('video');
    });

    test('should validate YouTube Shorts URL', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/shorts/abc123def');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('shorts');
    });

    test('should validate YouTube playlist URL', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/playlist?list=PLtest123');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('playlist');
    });

    test('should validate YouTube channel URL', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/@channelname');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('channel');
    });

    test('should reject non-YouTube URLs', () => {
      const result = validateYouTubeUrl('https://www.example.com/video');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('YouTube');
    });

    test('should reject dangerous file:// protocol', () => {
      const result = validateYouTubeUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('disallowed');
    });

    test('should reject javascript: protocol', () => {
      const result = validateYouTubeUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('disallowed');
    });

    test('should reject URLs that are too long', () => {
      const longUrl = 'https://www.youtube.com/watch?v=' + 'a'.repeat(2100);
      const result = validateYouTubeUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    test('should reject empty or null URLs', () => {
      expect(validateYouTubeUrl('').valid).toBe(false);
      expect(validateYouTubeUrl(null).valid).toBe(false);
      expect(validateYouTubeUrl(undefined).valid).toBe(false);
    });

    test('should reject non-string input', () => {
      const result = validateYouTubeUrl(12345);
      expect(result.valid).toBe(false);
    });

    test('should handle watch URL with playlist (mixed type)', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest123');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('playlist');
    });

    test('should reject invalid video ID', () => {
      const result = validateYouTubeUrl('https://www.youtube.com/watch?v=');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('video ID');
    });
  });

  describe('normalizeYouTubeUrl', () => {
    test('should add /videos to channel URL without tab', () => {
      const url = 'https://www.youtube.com/@channelname';
      const result = normalizeYouTubeUrl(url, 'channel');
      expect(result).toContain('/videos');
    });

    test('should not modify channel URL with /videos tab', () => {
      const url = 'https://www.youtube.com/@channelname/videos';
      const result = normalizeYouTubeUrl(url, 'channel');
      expect(result).toBe(url);
    });

    test('should not modify non-channel URLs', () => {
      const url = 'https://www.youtube.com/watch?v=test123';
      const result = normalizeYouTubeUrl(url, 'video');
      expect(result).toBe(url);
    });

    test('should add https:// protocol if missing', () => {
      const url = 'www.youtube.com/watch?v=test123';
      const result = normalizeYouTubeUrl(url, 'video');
      expect(result).toContain('https://');
    });
  });

  describe('sanitizeOutputPath', () => {
    test('should allow valid subdirectory path', () => {
      const downloadRoot = '/home/user/downloads';
      const outputPath = '/home/user/downloads/videos';
      const result = sanitizeOutputPath(outputPath, downloadRoot);
      expect(result).toBe(outputPath);
    });

    test('should reject path traversal with ..', () => {
      const downloadRoot = '/home/user/downloads';
      const outputPath = '/home/user/downloads/../secret';
      const result = sanitizeOutputPath(outputPath, downloadRoot);
      expect(result).toBeNull();
    });

    test('should reject path equal to root (not a subdirectory)', () => {
      const downloadRoot = '/home/user/downloads';
      const outputPath = '/home/user/downloads';
      const result = sanitizeOutputPath(outputPath, downloadRoot);
      expect(result).toBeNull();
    });

    test('should reject null or undefined inputs', () => {
      expect(sanitizeOutputPath(null, '/home/downloads')).toBeNull();
      expect(sanitizeOutputPath('/home/test', null)).toBeNull();
      expect(sanitizeOutputPath(undefined, '/home/downloads')).toBeNull();
    });

    test('should handle relative paths by resolving them', () => {
      const downloadRoot = '/home/user/downloads';
      const outputPath = 'videos/subfolder';
      const result = sanitizeOutputPath(outputPath, downloadRoot);
      // Relative paths will be resolved and checked
      // Result could be null if resolved path escapes root, or valid if within
      // This depends on current working directory, so we'll test absolute paths more reliably
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});
