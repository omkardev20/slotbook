import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  LOGO_CID,
  accountExistsEmail,
  consultantApprovedEmail,
  verificationEmail,
} from './emailTemplates.ts';

// `npm run mail:preview` writes the emails to .mail-preview/ so you can open
// them in a browser and see exactly what people will receive. Sends nothing.
mkdirSync('.mail-preview', { recursive: true });
copyFileSync('assets/email/logo.png', '.mail-preview/logo.png');

const emails = {
  verification: verificationEmail('482913', 10, { logo: true, name: 'Asha' }),
  'account-exists': accountExistsEmail({ logo: true }),
  'consultant-approved': consultantApprovedEmail({
    logo: true,
    name: 'Dr Asha',
    appUrl: 'https://app.slotbook.example',
  }),
};

for (const [name, email] of Object.entries(emails)) {
  // Real emails reference the logo by Content-ID. A browser can't, so point it at the file.
  writeFileSync(`.mail-preview/${name}.html`, email.html.replaceAll(`cid:${LOGO_CID}`, 'logo.png'));
  writeFileSync(`.mail-preview/${name}.txt`, `Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`Wrote .mail-preview/${name}.html and .txt  (subject: ${email.subject})`);
}
