'use strict';

const { resolveFolder } = require('../app/backend/config');
const path = require('path');

describe('config.js', () => {
  describe('resolveFolder', () => {
    const appRoot = '/home/user/app';

    test('should resolve relative path against appRoot', () => {
      const result = resolveFolder(appRoot, './downloads');
      expect(result).toBe(path.resolve(appRoot, './downloads'));
    });

    test('should return absolute path as-is', () => {
      const absolutePath = '/var/lib/downloads';
      const result = resolveFolder(appRoot, absolutePath);
      expect(result).toBe(absolutePath);
    });

    test('should handle null/empty relPath with default', () => {
      const result = resolveFolder(appRoot, null);
      expect(result).toBe(path.join(appRoot, 'downloads'));
    });

    test('should handle undefined relPath with default', () => {
      const result = resolveFolder(appRoot, undefined);
      expect(result).toBe(path.join(appRoot, 'downloads'));
    });

    test('should handle empty string relPath with default', () => {
      const result = resolveFolder(appRoot, '');
      expect(result).toBe(path.join(appRoot, 'downloads'));
    });

    test('should resolve nested relative paths', () => {
      const result = resolveFolder(appRoot, './downloads/videos');
      expect(result).toBe(path.resolve(appRoot, './downloads/videos'));
    });

    test('should handle Windows-style paths on Windows', () => {
      if (process.platform === 'win32') {
        const result = resolveFolder('C:\\app', '.\\downloads');
        expect(result).toContain('downloads');
      }
    });

    test('should handle path with parent directory references', () => {
      const result = resolveFolder(appRoot, '../downloads');
      // Should resolve but may be outside appRoot
      expect(result).toBeTruthy();
      expect(path.isAbsolute(result)).toBe(true);
    });
  });
});
