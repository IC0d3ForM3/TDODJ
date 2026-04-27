import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-tac-modal',
  standalone: true,
  imports: [],
  templateUrl: './tac-modal.html',
  styleUrl: './tac-modal.css',
})
export class TacModal {
  /** When true, shows the "I Agree" button (signup flow). */
  @Input() showAgreeButton = false;
  @Output() closed = new EventEmitter<void>();
  @Output() agreed = new EventEmitter<void>();

  onAgree(): void {
    this.agreed.emit();
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }

  downloadTac(): void {
    const text = this.tacPlainText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TDODJ-Terms-and-Conditions.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  private tacPlainText(): string {
    return `TERMS AND CONDITIONS
THE DUNGEONS OF DANNY JOE — BETA

PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY BEFORE CREATING AN ACCOUNT OR USING THE SERVICE.

1. AGREEMENT TO TERMS
By accessing or using The Dungeons of Danny Joe ("TDODJ," "the Service"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Service.

2. BETA STATUS
The Service is currently in beta. This means:
- Features may be added, changed, or removed at any time without prior notice.
- Your account data, game progress, and created content may be reset, altered, or deleted during the beta period.
- The Service may be unavailable or experience downtime without warning.
- We provide no guarantees regarding uptime, performance, or data retention.

3. ELIGIBILITY
You must be at least 13 years of age to use the Service. By registering, you confirm that you meet this requirement. If you are under 18, you confirm that you have your parent or guardian's permission.

4. USER ACCOUNTS
You are responsible for keeping your account credentials confidential. You agree not to share your account with others or use another person's account. You are responsible for all activity that occurs under your account.

5. ACCEPTABLE USE
You agree not to:
(a) Use the Service for any unlawful purpose;
(b) Attempt to gain unauthorized access to other accounts, systems, or data;
(c) Create, upload, or distribute content that is harmful, abusive, offensive, or defamatory;
(d) Attempt to reverse-engineer, decompile, or otherwise interfere with the Service;
(e) Use automated tools or bots to interact with the Service without express permission;
(f) Impersonate any other person or entity.

6. USER-CREATED CONTENT
Content you create (dungeons, characters, etc.) remains your intellectual property. By publishing content through the Service, you grant us a non-exclusive, worldwide, royalty-free license to store, display, and distribute that content to other users for as long as it remains published.

7. PRIVACY AND DATA
We collect your username, email address, and gameplay data to provide the Service. We do not sell your personal information to third parties. Data is stored securely and used only to operate the Service.

8. DISCLAIMER OF WARRANTIES
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

9. LIMITATION OF LIABILITY
TO THE FULLEST EXTENT PERMITTED BY LAW, TDODJ AND ITS CREATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.

10. CHANGES TO TERMS
We may update these Terms at any time. Your continued use of the Service after changes are posted constitutes acceptance of the updated Terms.

11. TERMINATION
We reserve the right to suspend or terminate your account at any time, with or without cause, particularly if you violate these Terms.

12. GOVERNING LAW
These Terms are governed by applicable law without regard to conflict of law provisions.

13. CONTACT
If you have questions about these Terms, please contact us through the Contact page on the website.

By creating an account, you acknowledge that you have read, understood, and agree to these Terms and Conditions.`;
  }
}
