'use strict';

const { parseProgress } = require('../app/backend/downloader');

describe('downloader.js', () => {
  describe('parseProgress', () => {
    test('should parse standard download progress line', () => {
      const line = '[download]  45.2% of 102.34MiB at 1.5MiB/s ETA 00:38';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.status).toBe('downloading');
      expect(result.progress).toBe(45.2);
      expect(result.speed).toBe('1.5MiB/s');
      expect(result.eta).toBe('00:38');
      expect(result.totalSize).toBe('102.34MiB');
      expect(result.phase).toBe('downloading');
    });

    test('should parse 100% completion', () => {
      const line = '[download] 100% of 102.34MiB at 2.0MiB/s ETA 00:00';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.progress).toBe(100);
    });

    test('should detect cached phase', () => {
      const line = '[download] 100% of 50.00MiB has already been downloaded';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.phase).toBe('cached');
      expect(result.progress).toBe(100);
    });

    test('should detect merging phase', () => {
      const line = '[download] 100% Destination: /path/to/file.mp4';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.phase).toBe('merging');
    });

    test('should return null for non-download lines', () => {
      const line = '[info] Extracting URL: https://youtube.com/watch?v=test';
      const result = parseProgress(line);
      expect(result).toBeNull();
    });

    test('should return null for lines without percentage', () => {
      const line = '[download] Starting download...';
      const result = parseProgress(line);
      expect(result).toBeNull();
    });

    test('should handle progress without speed or ETA', () => {
      const line = '[download]  25.5%';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.progress).toBe(25.5);
      expect(result.speed).toBeNull();
      expect(result.eta).toBeNull();
    });

    test('should clamp progress to 0-100 range', () => {
      // Edge case: ensure parseFloat doesn't go above 100
      const line = '[download]  105.5% of 50.00MiB';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.progress).toBe(100);
    });

    test('should handle decimal percentages correctly', () => {
      const line = '[download]   0.1% of 500.00MiB';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.progress).toBeCloseTo(0.1, 1);
    });

    test('should parse size with GiB units', () => {
      const line = '[download]  50% of 1.5GiB at 10MiB/s ETA 01:15';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.totalSize).toBe('1.5GiB');
    });

    test('should parse size with KiB units', () => {
      const line = '[download]  75% of 512.0KiB at 100KiB/s';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.totalSize).toBe('512.0KiB');
    });

    test('should return null for empty line', () => {
      const result = parseProgress('');
      expect(result).toBeNull();
    });

    test('should return null for invalid percent (NaN)', () => {
      const line = '[download]  abc% of 100MiB';
      const result = parseProgress(line);
      expect(result).toBeNull();
    });

    test('should handle progress with approximate size indicator', () => {
      const line = '[download]  30% of ~ 150.00MiB';
      const result = parseProgress(line);
      expect(result).not.toBeNull();
      expect(result.totalSize).toBe('150.00MiB');
    });
  });
});
