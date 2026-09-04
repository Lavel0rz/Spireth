#!/usr/bin/env node
const fs=require('fs');const path=require('path');
function walk(d,acc=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,acc);else if(e.name.endsWith('.b64'))acc.push(p);}return acc;}
const root='client/public/game/_b64';
for(const f of walk(root)){
  const rel=path.relative(root,f).replace(/\.b64$/,'');
  const out=path.join('client/public/game',rel);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,Buffer.from(fs.readFileSync(f,'utf8'),'base64'));
  console.log('wrote',out);
}
