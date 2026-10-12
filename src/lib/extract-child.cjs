const mammoth = require('mammoth');
const pdf = require('pdf-parse/lib/pdf-parse.js');
const buffers = []; let size = 0;
process.stdin.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) process.exit(2); buffers.push(chunk); });
process.stdin.on('end', async () => {
  try {
    const buffer = Buffer.concat(buffers);
    const text = process.argv[2] === 'pdf' ? (await pdf(buffer, { max: 100 })).text : (await mammoth.extractRawText({ buffer })).value;
    if (!text || text.length > 100000) process.exit(3);
    process.stdout.write(text);
  } catch { process.exit(4); }
});
