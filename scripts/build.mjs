import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'source');
const output=join(root,'public');
const assets=['index.html','style.css','app.mjs','modules/index.mjs'];
await mkdir(join(output,'modules'),{recursive:true});
for(const file of assets){
  await readFile(join(source,file));
  await copyFile(join(source,file),join(output,file));
}
console.log('Built PULSE Studio shell without audio tools.');
