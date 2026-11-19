// All email wording, layout and branding lives here, away from the sending code.
// Every email has an HTML part and a plain-text part, because some clients
// (and spam filters) prefer or require the text version.
//
// Email HTML is its own world: layout tables and inline styles only, because
// most mail clients ignore <style> blocks, flexbox and external CSS.

export const BRAND = 'SlotBook';

// The logo travels inside the email as an inline attachment (Content-ID), which
// works in Gmail and Outlook without hosting the image anywhere.
export const LOGO_CID = 'slotbook-logo';

// The SlotBook theme. Change a colour here and every email follows.
const THEME = {
  primary: '#4F46E5', // indigo: the logo tile, brand
  header: '#1E1B4B', // very dark indigo: header band, so the logo tile stands out
  deep: '#3730A3', // darker indigo: the code, text badge
  tint: '#EEF2FF', // pale indigo: code box
  tintBorder: '#C7D2FE',
  accent: '#10B981', // green: the "booked slot" stripe
  heading: '#111827',
  text: '#374151',
  muted: '#6B7280',
  page: '#F3F4F9',
  card: '#FFFFFF',
  cardBorder: '#E5E7EB',
} as const;

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, monospace";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateOptions {
  // True when the logo image is attached with LOGO_CID. False shows a text badge,
  // so the email never has a broken image.
  logo?: boolean;
  // Used for "Hi Asha,". Optional: without it the greeting is just "Hi,".
  name?: string;
  // Where the "Log in" button points. Optional: without it the button is left out.
  appUrl?: string;
}

// Anything dynamic goes through this before it is placed inside HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const greeting = (name?: string) => (name?.trim() ? `Hi ${name.trim()},` : 'Hi,');

function logoCell(useLogo: boolean): string {
  if (useLogo) {
    return `<img src="cid:${LOGO_CID}" width="44" height="44" alt="${BRAND}" style="display:block;border:0;border-radius:10px;" />`;
  }
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="44" height="44" align="center" valign="middle" bgcolor="${THEME.primary}" style="background-color:${THEME.primary};border-radius:10px;font-family:${FONT};font-size:24px;font-weight:700;color:#ffffff;">S</td></tr></table>`;
}

// `preheader` is the grey preview line inboxes show next to the subject.
function layout(options: {
  preheader: string;
  title: string;
  body: string;
  logo: boolean;
}): string {
  const { preheader, title, body, logo } = options;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${THEME.page};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${THEME.page}" style="background-color:${THEME.page};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${THEME.card}" style="max-width:520px;background-color:${THEME.card};border:1px solid ${THEME.cardBorder};border-radius:14px;overflow:hidden;">
            <tr>
              <td bgcolor="${THEME.header}" style="background-color:${THEME.header};padding:22px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle">${logoCell(logo)}</td>
                    <td valign="middle" style="padding-left:12px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.2px;color:#ffffff;">${BRAND}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td height="4" bgcolor="${THEME.accent}" style="height:4px;line-height:4px;font-size:0;background-color:${THEME.accent};">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:${FONT};font-size:15px;line-height:24px;color:${THEME.text};">
                ${body}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
            <tr>
              <td align="center" style="padding:20px 8px 0 8px;font-family:${FONT};font-size:12px;line-height:18px;color:${THEME.muted};">
                You received this because someone used this email address on ${BRAND}.<br />
                This is an automated message, please do not reply.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px;font-family:${FONT};font-size:12px;line-height:18px;color:${THEME.muted};">&copy; ${BRAND}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export function verificationEmail(
  code: string,
  expiresInMinutes: number,
  options: TemplateOptions = {},
): EmailContent {
  const minutes = `${expiresInMinutes} minute${expiresInMinutes === 1 ? '' : 's'}`;
  const hello = greeting(options.name);

  const html = layout({
    title: `Your ${BRAND} verification code`,
    preheader: `Your code is ${code}. It expires in ${minutes}.`,
    logo: options.logo ?? false,
    body: `
                <h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${THEME.heading};">Verify your email</h1>
                <p style="margin:0 0 20px 0;">${escapeHtml(hello)} welcome to ${BRAND}. Enter this code to confirm your email address and finish setting up your account:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${THEME.tint}" style="background-color:${THEME.tint};border:1px solid ${THEME.tintBorder};border-radius:12px;padding:20px 12px;font-family:${MONO};font-size:36px;line-height:40px;font-weight:700;letter-spacing:10px;color:${THEME.deep};">${escapeHtml(code)}</td>
                  </tr>
                </table>
                <p style="margin:20px 0 20px 0;">This code expires in <strong style="color:${THEME.heading};">${escapeHtml(minutes)}</strong>.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-left:3px solid ${THEME.accent};padding:2px 0 2px 12px;font-size:13px;line-height:20px;color:${THEME.muted};">Never share this code with anyone. ${BRAND} will never ask you for it. If you did not request it, you can safely ignore this email.</td>
                  </tr>
                </table>`,
  });

  const text = [
    hello,
    '',
    `Welcome to ${BRAND}. Your verification code is: ${code}`,
    '',
    `It expires in ${minutes}.`,
    '',
    `Never share this code with anyone. ${BRAND} will never ask you for it.`,
    'If you did not request it, you can safely ignore this email.',
  ].join('\n');

  return { subject: `${code} is your ${BRAND} verification code`, text, html };
}

export function accountExistsEmail(options: TemplateOptions = {}): EmailContent {
  const html = layout({
    title: `You already have a ${BRAND} account`,
    preheader: 'Someone tried to sign up with your email. Just log in.',
    logo: options.logo ?? false,
    body: `
                <h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${THEME.heading};">You already have an account</h1>
                <p style="margin:0 0 16px 0;">Someone tried to sign up for ${BRAND} with this email address, but an account already exists.</p>
                <p style="margin:0 0 20px 0;">You do not need to do anything except log in as usual.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-left:3px solid ${THEME.accent};padding:2px 0 2px 12px;font-size:13px;line-height:20px;color:${THEME.muted};">If this was not you, you can safely ignore this email. Your account has not been changed.</td>
                  </tr>
                </table>`,
  });

  const text = [
    `Someone tried to sign up for ${BRAND} with this email address, but an account already exists.`,
    '',
    'You do not need to do anything except log in as usual.',
    '',
    'If this was not you, you can safely ignore this email. Your account has not been changed.',
  ].join('\n');

  return { subject: `You already have a ${BRAND} account`, text, html };
}

// Sent to a consultant the moment an admin approves their account.
export function consultantApprovedEmail(options: TemplateOptions = {}): EmailContent {
  const hello = greeting(options.name);

  const button = options.appUrl
    ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="${THEME.primary}" style="background-color:${THEME.primary};border-radius:10px;">
                      <a href="${escapeHtml(options.appUrl)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Log in to ${BRAND}</a>
                    </td>
                  </tr>
                </table>`
    : '';

  const html = layout({
    title: `Your ${BRAND} consultant account is approved`,
    preheader: 'Good news: your consultant account has been approved.',
    logo: options.logo ?? false,
    body: `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
                  <tr>
                    <td bgcolor="${THEME.accent}" style="background-color:${THEME.accent};border-radius:999px;padding:4px 14px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1px;color:#ffffff;">APPROVED</td>
                  </tr>
                </table>
                <h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${THEME.heading};">Your consultant account is approved</h1>
                <p style="margin:0 0 16px 0;">${escapeHtml(hello)} good news: our team has reviewed and approved your ${BRAND} consultant account.</p>
                <p style="margin:0 0 24px 0;">You can now log in and use your account as a consultant.</p>${button}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-left:3px solid ${THEME.accent};padding:2px 0 2px 12px;font-size:13px;line-height:20px;color:${THEME.muted};">Already logged in? Log out and back in so the change shows up right away. If you were not expecting this email, you can safely ignore it.</td>
                  </tr>
                </table>`,
  });

  const text = [
    hello,
    '',
    `Good news: our team has reviewed and approved your ${BRAND} consultant account.`,
    '',
    'You can now log in and use your account as a consultant.',
    ...(options.appUrl ? ['', `Log in: ${options.appUrl}`] : []),
    '',
    'Already logged in? Log out and back in so the change shows up right away.',
    'If you were not expecting this email, you can safely ignore it.',
  ].join('\n');

  return { subject: `Your ${BRAND} consultant account is approved`, text, html };
}
