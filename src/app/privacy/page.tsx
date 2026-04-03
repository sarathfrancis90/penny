export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui' }}>
      <h1>Privacy Policy</h1>
      <p><strong>Penny — AI Expense Tracker</strong></p>
      <p>Last updated: April 3, 2026</p>

      <h2>1. Information We Collect</h2>
      <p>
        Penny collects the following information to provide expense tracking services:
      </p>
      <ul>
        <li><strong>Account Information</strong>: Email address and display name when you create an account.</li>
        <li><strong>Financial Data</strong>: Expense details (vendor, amount, category, date), budgets, income sources, and savings goals that you enter.</li>
        <li><strong>Receipt Images</strong>: Photos of receipts you upload for AI analysis.</li>
        <li><strong>Usage Data</strong>: Basic analytics about how you use the app to improve our service.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide AI-powered expense categorization using Google Gemini.</li>
        <li>To store and display your financial data across devices.</li>
        <li>To send budget alerts and notifications you have enabled.</li>
        <li>To improve the accuracy of expense analysis.</li>
      </ul>

      <h2>3. Data Storage & Security</h2>
      <p>
        Your data is stored securely on Google Firebase (Cloud Firestore) with encryption at rest
        and in transit. Receipt images are stored in Firebase Cloud Storage. Authentication is
        handled by Firebase Auth with support for biometric login (Face ID / Touch ID).
      </p>

      <h2>4. Third-Party Services</h2>
      <ul>
        <li><strong>Google Firebase</strong>: Authentication, database, storage, crash reporting.</li>
        <li><strong>Google Gemini AI</strong>: Receipt and expense analysis (text/images sent to Google&apos;s servers for processing).</li>
      </ul>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell your personal data. Your financial data is only shared with:
      </p>
      <ul>
        <li>Group members you explicitly invite to shared expense groups.</li>
        <li>Google&apos;s AI services for expense analysis (receipt images and text descriptions).</li>
      </ul>

      <h2>6. Your Rights</h2>
      <p>You can:</p>
      <ul>
        <li>Export your data at any time from the app.</li>
        <li>Delete your account and all associated data from Settings.</li>
        <li>Revoke group membership and shared access.</li>
      </ul>

      <h2>7. Children&apos;s Privacy</h2>
      <p>Penny is not intended for users under 17. We do not knowingly collect data from children.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this policy. Changes will be posted on this page with an updated date.</p>

      <h2>9. Contact</h2>
      <p>Questions? Contact us at <a href="mailto:sarathfrancis90@gmail.com">sarathfrancis90@gmail.com</a></p>
    </div>
  );
}
