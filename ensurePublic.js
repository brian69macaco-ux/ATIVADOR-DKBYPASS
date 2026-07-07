const fs = require('fs');
const path = require('path');
const assets = require('./public-bundle');

function ensurePublic(rootDir) {
  const publicDir = path.join(rootDir, 'public');
  const marker = path.join(publicDir, 'index.html');

  if (fs.existsSync(marker)) {
    return;
  }

  fs.mkdirSync(publicDir, { recursive: true });

  for (const [name, content] of Object.entries(assets)) {
    fs.writeFileSync(path.join(publicDir, name), content, 'utf8');
  }

  console.log(`Pasta public criada automaticamente (${Object.keys(assets).length} arquivos)`);
}

module.exports = { ensurePublic };
