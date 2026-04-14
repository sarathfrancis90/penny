import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Delete Your Account — Penny",
  description:
    "Learn how to delete your Penny account and all associated data.",
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 sm:px-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900">
          Delete Your Account
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Penny — AI Expense Tracker
        </p>

        <hr className="my-8 border-gray-200" />

        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              How to Delete Your Account
            </h2>
            <p className="mt-2 text-gray-600">
              You can delete your account directly from the Penny app:
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-6 text-gray-700">
              <li>Open the Penny app on your device.</li>
              <li>
                Go to the <strong>Profile</strong> tab (bottom navigation).
              </li>
              <li>
                Tap <strong>Settings</strong>.
              </li>
              <li>
                Scroll to the bottom and tap{" "}
                <strong className="text-red-600">Delete Account</strong>.
              </li>
              <li>Confirm the deletion when prompted.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              What Data Gets Deleted
            </h2>
            <p className="mt-2 text-gray-600">
              When you delete your account, the following data is{" "}
              <strong>permanently and immediately deleted</strong>:
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-6 text-gray-700">
              <li>Your user profile and account credentials</li>
              <li>All expenses (personal and group)</li>
              <li>Budget configurations</li>
              <li>Income sources</li>
              <li>Savings goals</li>
              <li>AI chat conversations and messages</li>
              <li>Group memberships and invitations</li>
              <li>Notification history</li>
              <li>Receipt images stored in the cloud</li>
              <li>Push notification tokens</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Data Retention
            </h2>
            <p className="mt-2 text-gray-600">
              Penny does <strong>not</strong> retain any of your personal data
              after account deletion. All data is deleted immediately and cannot
              be recovered. There is no retention period.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Need Help?
            </h2>
            <p className="mt-2 text-gray-600">
              If you are unable to delete your account through the app (for
              example, if you cannot sign in), please contact us at{" "}
              <a
                href="mailto:support@penny-app.ca"
                className="font-medium text-blue-600 hover:underline"
              >
                support@penny-app.ca
              </a>{" "}
              and we will process your deletion request within 48 hours.
            </p>
          </div>
        </section>

        <hr className="my-8 border-gray-200" />

        <p className="text-sm text-gray-400">
          Last updated: April 2026
        </p>
      </div>
    </main>
  );
}
