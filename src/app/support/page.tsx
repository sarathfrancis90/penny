export default function Support() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui' }}>
      <h1>Support</h1>
      <p><strong>Penny — AI Expense Tracker</strong></p>
      <p>We&apos;re here to help! If you have questions, feedback, or need assistance, please reach out using any of the options below.</p>

      <h2>Contact Us</h2>
      <p>
        <strong>Email:</strong>{' '}
        <a href="mailto:sarathfrancis90@gmail.com">sarathfrancis90@gmail.com</a>
      </p>
      <p>We aim to respond to all support requests within 24 hours.</p>

      <h2>Frequently Asked Questions</h2>

      <h3>How do I add an expense?</h3>
      <p>
        On the Home screen, type a description of your expense (e.g., &quot;Lunch at Tim Hortons $14.50&quot;)
        and tap send. Penny&apos;s AI will automatically extract the vendor, amount, category, and date.
        Review the details and tap &quot;Confirm &amp; Save&quot;. You can also tap the camera icon to scan a receipt.
      </p>

      <h3>How do I set up a budget?</h3>
      <p>
        Go to the Finances tab and tap &quot;Manage Budgets&quot;. Tap the + button to create a new budget.
        Select a category, set a monthly limit, and optionally configure rollover and alert settings.
      </p>

      <h3>How do I create a group for shared expenses?</h3>
      <p>
        Go to the Groups tab and tap the + button. Enter a group name, description, and icon.
        After creating the group, you can invite members by email. Group expenses are tracked
        separately and all members receive notifications.
      </p>

      <h3>How does AI expense analysis work?</h3>
      <p>
        Penny uses Google Gemini AI to analyze your expense descriptions and receipt images.
        It automatically identifies the vendor, amount, date, and assigns the correct CRA T2125
        tax category for Canadian self-incorporated professionals. You can always edit the
        details before saving.
      </p>

      <h3>Is my financial data secure?</h3>
      <p>
        Yes. All data is stored on Google Firebase with encryption at rest and in transit.
        Authentication is handled by Firebase Auth with support for email/password, Google,
        and Apple Sign-In. Receipt images are stored in Firebase Cloud Storage with
        access restricted to authenticated users. See our{' '}
        <a href="/privacy">Privacy Policy</a> for full details.
      </p>

      <h3>Can I export my expenses?</h3>
      <p>
        Yes. On the Dashboard, tap the export icon (share button) in the top right.
        You can export your filtered expenses as a CSV file to share via email,
        AirDrop, or save to Files.
      </p>

      <h3>How do I switch between light and dark mode?</h3>
      <p>
        Go to Profile &rarr; Settings &rarr; Appearance. You can choose System (follows
        your device setting), Light, or Dark.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        Go to Profile &rarr; Settings &rarr; scroll to the bottom and tap &quot;Delete Account&quot;.
        This will permanently delete all your data including expenses, budgets, income sources,
        and savings goals.
      </p>

      <h2>Report a Bug</h2>
      <p>
        If you encounter a bug or unexpected behavior, please email us at{' '}
        <a href="mailto:sarathfrancis90@gmail.com">sarathfrancis90@gmail.com</a>{' '}
        with a description of the issue, the device you&apos;re using, and screenshots if possible.
      </p>

      <h2>App Information</h2>
      <ul>
        <li><strong>Developer:</strong> Sarath Francis</li>
        <li><strong>App Version:</strong> 1.0</li>
        <li><strong>Platform:</strong> iOS</li>
        <li><a href="/privacy">Privacy Policy</a></li>
      </ul>

      <p style={{ marginTop: 40, color: '#888', fontSize: 14 }}>
        &copy; 2026 Penny. All rights reserved.
      </p>
    </div>
  );
}
