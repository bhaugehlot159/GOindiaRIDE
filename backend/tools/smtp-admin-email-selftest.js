/* eslint-disable no-console */
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_error) {
  // dotenv is optional at runtime when env is injected by PM2/systemd.
}

const { sendEmail, getTransporter } = require('../src/utils/mailer');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || String(next).startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueEmails(list = []) {
  return [...new Set(
    list
      .map((email) => String(email || '').trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )];
}

function resolveRecipients(explicitTo = '') {
  const cli = splitCsv(explicitTo);
  const envRecipients = [
    ...splitCsv(process.env.BOOKING_ADMIN_ALERT_EMAILS),
    ...splitCsv(process.env.ADMIN_ALERT_EMAILS),
    ...splitCsv(process.env.ADMIN_EMAILS)
  ];
  return uniqueEmails(cli.length ? cli : envRecipients);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const recipients = resolveRecipients(String(args.to || ''));
  const subject = `[GO India RIDE] SMTP Admin Alert Self-Test ${new Date().toISOString()}`;
  const text = [
    'This is an automated SMTP self-test for GO India RIDE admin booking alerts.',
    `Time: ${new Date().toISOString()}`,
    'If you received this, SMTP is working for admin alert delivery.'
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;">
<h3>GO India RIDE SMTP Self-Test</h3>
<p>This is an automated SMTP self-test for admin booking alerts.</p>
<p><strong>Time:</strong> ${new Date().toISOString()}</p>
<p>If you received this, SMTP is working.</p>
</div>`;

  console.log('=== GOIndiaRIDE SMTP Admin Email Self-Test ===');
  console.log('SMTP_HOST:', process.env.SMTP_HOST ? 'configured' : 'missing');
  console.log('SMTP_USER:', process.env.SMTP_USER ? 'configured' : 'missing');
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'configured' : 'missing');
  console.log('Recipients:', recipients.length ? recipients.join(', ') : 'none');

  const transporter = getTransporter();
  if (!transporter) {
    console.error('SMTP transporter unavailable. Configure SMTP_HOST/SMTP_USER/SMTP_PASS.');
    process.exitCode = 2;
    return;
  }

  if (!recipients.length) {
    console.error('No admin recipients found. Set BOOKING_ADMIN_ALERT_EMAILS or pass --to <email>');
    process.exitCode = 2;
    return;
  }

  const result = await sendEmail({
    to: recipients.join(','),
    subject,
    text,
    html
  });

  if (result && result.skipped) {
    console.error('Email send skipped by mailer (smtp_not_configured_or_nodemailer_missing).');
    process.exitCode = 2;
    return;
  }

  console.log('SMTP self-test email sent successfully.');
  if (result && result.messageId) {
    console.log('messageId:', result.messageId);
  }
}

run().catch((error) => {
  console.error('smtp-admin-email-selftest failed:', error && error.message ? error.message : error);
  process.exitCode = 1;
});

