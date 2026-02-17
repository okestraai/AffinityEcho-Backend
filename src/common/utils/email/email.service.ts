import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import logger from '../logger.util';

@Injectable()
export class EmailService {
  private transporter!: nodemailer.Transporter;
  private isConnected = false;
  private isInitializing = false;

  constructor(private config: ConfigService) {
    this.initializeTransporter().catch((error) => {
      logger.error('Failed to initialize EmailService:', error);
    });
  }

  private async initializeTransporter() {
    if (this.isInitializing) return;

    this.isInitializing = true;

    try {
      const host = this.config.get('SMTP_HOST');
      const port = this.config.get('SMTP_PORT');
      const user = this.config.get('SMTP_USER');
      const pass = this.config.get('SMTP_PASS');
      const fromEmail = this.config.get('FROM_EMAIL');

      // Validate configuration
      if (!host || !port || !user || !pass || !fromEmail) {
        throw new Error('Email service configuration is incomplete');
      }

      await this.setupTransporter(host, port, user, pass);
    } finally {
      this.isInitializing = false;
    }
  }

  private async setupTransporter(
    host: string,
    port: string | number,
    user: string,
    pass: string,
  ) {
    const config = {
      host,
      port: Number(port),
      secure: false,
      requireTLS: true,
      auth: {
        user: user.trim(),
        pass: pass.trim(),
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    try {
      this.transporter = nodemailer.createTransport(config);
      await this.transporter.verify();
      this.isConnected = true;
      logger.info('SMTP connection successful');
    } catch (error: any) {
      logger.error('SMTP connection failed:', error.message);

      this.transporter = nodemailer.createTransport(config);
      this.isConnected = false;
      throw error;
    }
  }

  private async renderTemplate(
    templateName: string,
    data: any,
  ): Promise<string> {
    try {
      const templatePath = path.join(
        __dirname,
        '../../templates/emails',
        `${templateName}.ejs`,
      );

      return await ejs.renderFile(templatePath, data);
    } catch (error: any) {
      logger.error(`Template render failed: ${templateName}`, error);
      // Fallback HTML
      return `
        <html>
          <body>
            <h2>${data.subject || 'Notification'}</h2>
            <p>Hello ${data.username || 'User'},</p>
            ${data.otp ? `<p>Your verification code: <strong>${data.otp}</strong></p>` : ''}
            <p>If you didn't request this, please ignore this email.</p>
          </body>
        </html>
      `;
    }
  }

  async sendEmail(to: string, subject: string, template: string, data: any) {
    // Ensure connection
    if (!this.isConnected) {
      try {
        await this.transporter.verify();
        this.isConnected = true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Email service not available: ${message}`);
      }
    }

    try {
      const html = await this.renderTemplate(template, data);

      const mailOptions = {
        from: `"Affinity Echo" <${this.config.get('FROM_EMAIL') || 'noreply@affinityecho.com'}>`,
        to,
        subject,
        html,
      };

      const result = await this.transporter.sendMail(mailOptions);

      logger.info(`Email sent successfully to ${to}`);
      return result;
    } catch (error: any) {
      logger.error('Email send failed:', {
        to,
        subject,
        error: error.message,
      });
      throw error;
    }
  }

  async sendOtpEmail(email: string, otp: string, username: string) {
    return this.sendEmail(email, 'Verify Your Account - Affinity Echo', 'otp', {
      username,
      otp,
      supportEmail: this.config.get('SUPPORT_EMAIL'),
    });
  }

  async sendPasswordResetEmail(email: string, token: string, username: string) {
    const resetUrl = `${this.config.get('FRONTEND_URL')}/reset-password?token=${token}`;

    return this.sendEmail(
      email,
      'Reset Your Password - Affinity Echo',
      'reset-password',
      {
        username,
        resetUrl,
        supportEmail: this.config.get('SUPPORT_EMAIL'),
      },
    );
  }

  async sendWelcomeEmail(email: string, username: string) {
    return this.sendEmail(email, 'Welcome to Affinity Echo!', 'welcome', {
      username,
      loginUrl: `${this.config.get('FRONTEND_URL')}/login`,
      supportEmail: this.config.get('SUPPORT_EMAIL'),
    });
  }

  async sendPasswordResetOtpEmail(
    email: string,
    otp: string,
    username: string,
  ) {
    return this.sendEmail(
      email,
      'Reset Your Password - Affinity Echo',
      'password-reset-otp',
      {
        username,
        otp,
        supportEmail: this.config.get('SUPPORT_EMAIL'),
      },
    );
  }

  async sendPasswordResetConfirmation(email: string, username: string) {
    return this.sendEmail(
      email,
      'Password Reset Successful - Affinity Echo',
      'password-reset-confirmation',
      {
        username,
        loginUrl: `${this.config.get('FRONTEND_URL')}/login`,
        supportEmail: this.config.get('SUPPORT_EMAIL'),
      },
    );
  }

  async sendConnectionRequestEmail(
    email: string,
    username: string,
    referralId: string,
  ) {
    logger.info(`Connection request email to ${email} for user ${username}`);
    // TODO: Implement template and send logic
  }

  async sendConnectionAcceptedEmail(
    email: string,
    username: string,
    referralId: string,
  ) {
    logger.info(`Connection accepted email to ${email} for user ${username}`);
    // TODO: Implement template and send logic
  }

  async sendIdentityRevealRequestEmail(
    email: string,
    username: string,
    connectionId: string,
  ) {
    logger.info(
      `Identity reveal request email to ${email} for connection ${connectionId}`,
    );
    // TODO: Implement template and send logic
  }

  async sendIdentityRevealAcceptedEmail(
    email: string,
    username: string,
    connectionId: string,
  ) {
    logger.info(
      `Identity reveal accepted email to ${email} for connection ${connectionId}`,
    );
    // TODO: Implement template and send logic
  }
}
