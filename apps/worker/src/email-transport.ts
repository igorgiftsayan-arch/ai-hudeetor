import nodemailer from 'nodemailer';

export type IdentityEmail = {
  messageId: string;
  to: string;
  subject: string;
  text: string;
};

export abstract class EmailTransport {
  abstract send(message: IdentityEmail): Promise<void>;
}

export class FakeEmailTransport extends EmailTransport {
  readonly sent: IdentityEmail[] = [];

  async send(message: IdentityEmail): Promise<void> {
    this.sent.push(message);
  }
}

export class SmtpEmailTransport extends EmailTransport {
  private readonly client;

  constructor(options: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  }) {
    super();
    this.client = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: !options.secure,
      auth: { user: options.user, pass: options.password },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000,
    });
    this.from = options.from;
  }

  private readonly from: string;

  async send(message: IdentityEmail): Promise<void> {
    await this.client.sendMail({ ...message, from: this.from });
  }
}
