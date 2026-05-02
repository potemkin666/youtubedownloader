'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check available disk space for the given folder path.
 * Returns {available, total, used, sufficient, formatted}
 */
function checkSpace(folderPath) {
  return new Promise((resolve) => {
    if (!folderPath || typeof folderPath !== 'string' || folderPath.includes('..')) {
      return resolve({ available: 0, total: 0, sufficient: false, formatted: { available: '0 B', total: '0 B' }, error: 'Invalid path' });
    }
    const normalizedPath = path.resolve(folderPath);

    if (!fs.existsSync(normalizedPath)) {
      return resolve({
        available: 0,
        total: 0,
        used: 0,
        sufficient: false,
        formatted: { available: '0 B', total: '0 B' },
        error: 'Path does not exist'
      });
    }

    if (process.platform === 'win32') {
      // Use PowerShell to get drive free space
      const driveLetter = normalizedPath.slice(0, 2);
      const psCmd = `(Get-PSDrive -Name '${driveLetter.replace(':', '')}' | Select-Object -ExpandProperty Free)`;
      execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], {
        timeout: 8000,
        windowsHide: true
      }, (err, stdout) => {
        if (err) {
          return resolve(_fallbackSpaceCheck(normalizedPath));
        }
        const available = parseInt(stdout.trim(), 10);
        if (isNaN(available)) return resolve(_fallbackSpaceCheck(normalizedPath));
        const SUFFICIENT_THRESHOLD = 500 * 1024 * 1024; // 500MB
        resolve({
          available,
          total: 0,
          used: 0,
          sufficient: available > SUFFICIENT_THRESHOLD,
          formatted: { available: formatBytes(available), total: 'N/A' }
        });
      });
    } else {
      // Use df on Linux/macOS
      execFile('df', ['-k', normalizedPath], { timeout: 8000 }, (err, stdout) => {
        if (err) return resolve(_fallbackSpaceCheck(normalizedPath));
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return resolve(_fallbackSpaceCheck(normalizedPath));
        const parts = lines[1].trim().split(/\s+/);
        // df -k: Filesystem 1K-blocks Used Available Use% Mounted
        const total = parseInt(parts[1], 10) * 1024;
        const available = parseInt(parts[3], 10) * 1024;
        const used = parseInt(parts[2], 10) * 1024;
        const SUFFICIENT_THRESHOLD = 500 * 1024 * 1024;
        resolve({
          available: isNaN(available) ? 0 : available,
          total: isNaN(total) ? 0 : total,
          used: isNaN(used) ? 0 : used,
          sufficient: !isNaN(available) && available > SUFFICIENT_THRESHOLD,
          formatted: {
            available: formatBytes(available),
            total: formatBytes(total)
          }
        });
      });
    }
  });
}

function _fallbackSpaceCheck(folderPath) {
  // Validate the path is safe before writing probe file
  const resolvedPath = path.resolve(folderPath);
  if (!resolvedPath || resolvedPath.includes('..')) {
    return { available: 0, total: 0, used: 0, sufficient: false, formatted: { available: '0 B', total: '0 B' }, error: 'Invalid path' };
  }
  const probe = path.join(resolvedPath, `.abyssfetch_probe_${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'probe');
    fs.unlinkSync(probe);
    return { available: -1, total: -1, used: -1, sufficient: true, formatted: { available: 'Unknown', total: 'Unknown' } };
  } catch (_) {
    return { available: 0, total: 0, used: 0, sufficient: false, formatted: { available: '0 B', total: '0 B' }, error: 'No write access' };
  }
}

/**
 * Check if the folder path exists and is accessible.
 * Expects an absolute, pre-validated path from trusted sources (e.g., config).
 */
function checkDrivePresent(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return Promise.resolve({ present: false, error: 'Invalid path' });
  }
  // Reject any path with traversal sequences
  if (folderPath.includes('..')) {
    return Promise.resolve({ present: false, error: 'Invalid path' });
  }
  const safePath = path.normalize(folderPath);
  return Promise.resolve({ present: fs.existsSync(safePath) });
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = { checkSpace, checkDrivePresent, formatBytes };
