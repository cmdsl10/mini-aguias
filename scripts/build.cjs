// Only public site assets belong in the deployment.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
if (path.dirname(output) !== root || (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) throw Error('Unsafe build destination');
if (fs.existsSync(output)) fs.rmSync(output, {recursive:true});
fs.mkdirSync(output);
for (const name of ['index.html','content.js','content.css','masters.js','masters-domain.js','masters.css','manifest.webmanifest','assets']) {
  fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true});
}
console.log('Built public site in dist; private validation files excluded.');
