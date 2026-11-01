import {mkdir,copyFile,readFile,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'source'),output=join(root,'public');
await mkdir(join(output,'modules'),{recursive:true});
for(const file of ['index.html','style.css','app.mjs']){await readFile(join(source,file));await copyFile(join(source,file),join(output,file));}
for(const file of await readdir(join(source,'modules'))){if(file.endsWith('.mjs')||file.endsWith('.css'))await copyFile(join(source,'modules',file),join(output,'modules',file));}
console.log('Built PULSE Studio with browser audio modules.');
