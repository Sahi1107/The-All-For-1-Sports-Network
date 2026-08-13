import { writeFileSync, mkdirSync } from 'fs';
import { renderSampleEmails } from '../src/services/email';
const dir = process.argv[2] || './rendered-emails';
mkdirSync(dir, { recursive: true });
for (const e of renderSampleEmails()) {
  writeFileSync(`${dir}/${e.name}.html`, e.html);
  console.log(`${e.name.padEnd(30)}  “${e.subject}”`);
}
console.log(`\n${renderSampleEmails().length} emails written to ${dir}`);
