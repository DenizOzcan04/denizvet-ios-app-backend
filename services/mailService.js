import nodemailer from "nodemailer";

function getTransporter() {
  const hasMailConfig =
    !!process.env.MAIL_HOST &&
    !!process.env.MAIL_PORT &&
    !!process.env.MAIL_USER &&
    !!process.env.MAIL_PASS;

  if (!hasMailConfig) {
    console.log("Mail servisi atlandi: MAIL_* ayarlari eksik.");
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
}

export async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();

  if (!to || !transporter) {
    return false;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
    html,
  });

  console.log(`Mail gonderildi -> ${to} | ${subject}`);
  return true;
}

export async function sendMailSafely(payload, contextLabel = "mail") {
  try {
    await sendMail(payload);
  } catch (error) {
    console.log(`${contextLabel} gonderim hatasi:`, error);
  }
}
