import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import logger from '../logger.util';

@Injectable()
export class EmailService {
  private transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT')),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  private async renderTemplate(templateName: string, data: any): Promise<string> {
    const templatePath = path.join(__dirname, '../../templates/emails', `${templateName}.ejs`);
    return await ejs.renderFile(templatePath, data);
  }

  async sendEmail(to: string, subject: string, template: string, data: any) {
    try {
      const html = await this.renderTemplate(template, data);

      const mailOptions = {
        from: `"Affinity Echo" <${this.config.get('FROM_EMAIL')}>`,
        to,
        subject,
        html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { to, subject, messageId: result.messageId });
      return result;
    } catch (error: any) {
      logger.error('Failed to send email', { to, subject, error: error.message });
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
  try {
    const resetUrl = `${this.config.get('FRONTEND_URL')}/reset-password?token=${token}`;
    
    logger.info('Sending password reset email', { 
      email, 
      username,
      frontendUrl: this.config.get('FRONTEND_URL'),
      hasToken: !!token 
    });
    
    const result = await this.sendEmail(
      email, 
      'Reset Your Password - Affinity Echo', 
      'reset-password', 
      {
        username,
        resetUrl,
        supportEmail: this.config.get('SUPPORT_EMAIL'),
      }
    );

    logger.info('Password reset email sent successfully', { 
      email, 
      messageId: result.messageId 
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to send password reset email', { 
      email, 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

  async sendWelcomeEmail(email: string, username: string) {
    return this.sendEmail(email, 'Welcome to Affinity Echo!', 'welcome', {
      username,
      loginUrl: `${this.config.get('FRONTEND_URL')}/login`,
      supportEmail: this.config.get('SUPPORT_EMAIL'),
    });
  }
  // Add to your EmailService
async sendPasswordResetOtpEmail(email: string, otp: string, username: string) {
  return this.sendEmail(
    email, 
    'Reset Your Password - Affinity Echo', 
    'password-reset-otp', 
    {
      username,
      otp,
      supportEmail: this.config.get('SUPPORT_EMAIL'),
    }
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
    }
  );
}
}