/**
 * Express router for estimation file list, download, and DOCX→PDF preview (LibreOffice).
 * Mount example: app.use('/api/products', estimationFilesRouter);
 *
 * Dependencies: express, and `libreoffice` on PATH for DOCX conversion.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const router = express.Router();

const estimationDirPath = path.join(__dirname, '..', 'FileStorage', 'ESTIMATION');
console.log('Estimation dir path:', estimationDirPath);

function assertPathInsideDir(resolvedPath, baseDir) {
  const base = path.resolve(baseDir) + path.sep;
  const resolved = path.resolve(resolvedPath);
  return resolved === path.resolve(baseDir) || resolved.startsWith(base);
}

router.get('/get/estimationFile/:filename', (req, res) => {
  const safeFilename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = path.join(estimationDirPath, safeFilename);

  if (!assertPathInsideDir(filePath, estimationDirPath)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      message: 'File not found',
      requested: safeFilename,
    });
  }

  const ext = path.extname(safeFilename).toLowerCase();

  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
  };

  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  const inlineTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const disposition = inlineTypes.includes(ext) ? 'inline' : 'attachment';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);

  const fileStream = fs.createReadStream(filePath);

  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error reading file', error: err.message });
    }
  });
});

router.get('/preview/estimationFile/:filename', (req, res) => {
  const safeFilename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = path.join(estimationDirPath, safeFilename);
  const ext = path.extname(safeFilename).toLowerCase();

  if (!assertPathInsideDir(filePath, estimationDirPath)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  if (ext === '.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    return fs.createReadStream(filePath).pipe(res);
  }

  if (ext === '.docx') {
    const outputDir = path.join(estimationDirPath, 'converted');

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const pdfFilename = safeFilename.replace(/\.docx$/i, '.pdf');
    const pdfPath = path.join(outputDir, pdfFilename);

    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdfFilename}"`);
      return fs.createReadStream(pdfPath).pipe(res);
    }

    const cmd = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${filePath}"`;
    return exec(cmd, (err) => {
      if (err) {
        console.error('LibreOffice error:', err);
        return res.status(500).json({ message: 'Conversion failed' });
      }
      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ message: 'Conversion produced no PDF file' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdfFilename}"`);
      return fs.createReadStream(pdfPath).pipe(res);
    });
  }

  return res.status(415).json({ message: 'Preview not supported for this file type', ext });
});

router.get('/list/estimationFiles', (req, res) => {
  if (!fs.existsSync(estimationDirPath)) {
    return res.status(500).json({
      message: 'Estimation directory not found',
      path: estimationDirPath,
    });
  }

  fs.readdir(estimationDirPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return res.status(500).json({
        message: 'Unable to scan directory',
        error: err.message,
      });
    }

    const names = files.filter((name) => !name.startsWith('.') && name !== 'converted');
    // Return createdAt so the UI can show "Saved" like the Draft Inbox.
    const items = names
      .map((filename) => {
        try {
          const fullPath = path.join(estimationDirPath, filename);
          const stat = fs.statSync(fullPath);
          const dt = stat.birthtime || stat.ctime || stat.mtime;
          return { filename, createdAt: dt?.toISOString ? dt.toISOString() : undefined };
        } catch (e) {
          // If we can't stat a file, still include it without createdAt.
          return { filename, createdAt: undefined };
        }
      });

    res.status(200).json({ files: items });
  });
});

module.exports = router;
