type OtpEmailType =
  | "email-verification"
  | "sign-in"
  | "forget-password"
  | "change-email";

function subjectForType(type: OtpEmailType): string {
  switch (type) {
    case "email-verification":
      return "Verify your Timeplete email";
    case "sign-in":
      return "Your Timeplete sign-in code";
    case "forget-password":
      return "Reset your Timeplete password";
    case "change-email":
      return "Confirm your new Timeplete email";
  }
}

function bodyForType(type: OtpEmailType, otp: string): { text: string; html: string } {
  const intro =
    type === "email-verification"
      ? "Enter this code to verify your email and finish creating your Timeplete account:"
      : type === "forget-password"
        ? "Enter this code to reset your Timeplete password:"
        : type === "sign-in"
          ? "Enter this code to sign in to Timeplete:"
          : "Enter this code to confirm your new email address for Timeplete:";

  const text = `${intro}\n\n${otp}\n\nThis code expires in 5 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <p>${intro}</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 24px 0;">${otp}</p>
    <p style="color: #666;">This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
  `.trim();

  return { text, html };
}

export async function sendOtpEmail(args: {
  email: string;
  otp: string;
  type: OtpEmailType;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    console.error(
      "RESEND_API_KEY or RESEND_FROM_EMAIL is not set on the Convex deployment",
    );
    throw new Error("Email service is not configured");
  }

  const { text, html } = bodyForType(args.type, args.otp);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.email],
      subject: subjectForType(args.type),
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend API error:", response.status, detail);
    throw new Error("Failed to send verification email");
  }
}
