const xlsx = require('xlsx');
const { TextDecoder } = require('util');
const ApiError = require('../utils/apiError');

function decode(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw ApiError.badRequest('File contains no data', 'INVALID_FILE');
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  if (zip || ole) {
    try {
      const book = xlsx.read(buffer, { type: 'buffer' });
      if (!book.SheetNames.length) throw new Error('No worksheets');
      return xlsx.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]]);
    } catch (err) {
      throw ApiError.badRequest('Invalid Excel workbook', 'INVALID_FILE');
    }
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    // Legacy single-byte telemetry exports; no UTF-8 mojibake on valid input.
    text = buffer.toString('latin1');
  }
  if (text.includes('\0')) throw ApiError.badRequest('Unsupported binary file or text encoding', 'INVALID_FILE');
  return text.replace(/^\uFEFF/, '');
}

// Split logical CSV records, including quoted line breaks and escaped quotes.
function logicalLines(text) {
  const lines = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (text[i] === '\n' || text[i] === '\r')) {
      lines.push(text.slice(start, i));
      if (text[i] === '\r' && text[i + 1] === '\n') i += 1;
      start = i + 1;
    }
  }
  if (quoted) throw ApiError.badRequest('Unterminated quoted CSV field', 'VALIDATION_ERROR');
  lines.push(text.slice(start));
  return lines;
}

function validateFormat(buffer, fileName) {
  if (!fileName) return;
  const ext = require('path').extname(fileName).toLowerCase();
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  if ((ext === '.xlsx' && !zip) || (ext === '.xls' && !ole) || (ext === '.csv' && (zip || ole))) {
    throw ApiError.badRequest('File contents do not match the declared CSV/Excel format', 'INVALID_FILE');
  }
}
module.exports = { decode, logicalLines, validateFormat };
