# 🔐 Password Reset Flow - Complete Guide

## Overview

Penny's password reset flow uses Firebase Authentication's built-in password reset functionality with a custom UI for a seamless, secure user experience.

---

## 📋 **User Flow**

### **1. Forgot Password (Initial Request)**
- **URL**: `/forgot-password`
- **User Action**: Enters their email address
- **Backend**: Firebase sends a secure password reset email
- **Result**: Success screen with instructions

### **2. Email Received**
- **Content**: Email from Firebase with reset link
- **Link Format**: `https://penny-amber.vercel.app/reset-password?oobCode=ABC123...`
- **Expiration**: 1 hour (Firebase default)

### **3. Reset Password (Token Verification)**
- **URL**: `/reset-password?oobCode=ABC123...`
- **Process**:
  1. Verifies the reset code with Firebase
  2. Shows user's email for confirmation
  3. Prompts for new password
  4. Real-time password strength validation
- **Result**: Password updated, auto-redirect to login

### **4. Login with New Password**
- **URL**: `/login?reset=success`
- **Display**: Success message confirming password was reset
- **User Action**: Sign in with new credentials

---

## 🔒 **Security Features**

### **Token Security**
- ✅ **Cryptographically Secure**: Firebase generates tokens using industry-standard algorithms
- ✅ **Single-Use**: Tokens can only be used once
- ✅ **Time-Limited**: Expires in 1 hour
- ✅ **Tied to User**: Token is bound to specific user account

### **Password Requirements**
Enforced in real-time with visual feedback:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)

### **Rate Limiting**
- Firebase automatically implements rate limiting
- Prevents brute force attacks
- Blocks excessive reset requests from same IP

### **Email Verification**
- Reset link only sent to registered email addresses
- Generic success message shown (doesn't reveal if email exists)
- Prevents account enumeration

---

## 🎨 **UI/UX Features**

### **Visual Design**
- Gradient backgrounds matching Penny's theme
- Card-based layout for focus
- Responsive mobile-first design
- Dark mode support

### **User Feedback**
- **Loading States**: Spinner animations during processing
- **Error Messages**: Clear, actionable error descriptions
- **Success States**: Checkmark icons and confirmation messages
- **Progress Indicators**: Step-by-step visual guidance

### **Password Validation**
- **Real-time**: Validates as user types
- **Visual Indicators**: 
  - ❌ Red text for failed requirements
  - ✅ Green checkmark when strong
- **Match Confirmation**: Live feedback if passwords match

### **Smart Features**
- **Email Pre-fill**: Carries email from reset link to login
- **Auto-redirect**: After successful reset (3 seconds)
- **Retry Options**: Easy access to request new link
- **Back Navigation**: Clear paths to return to login

---

## 🧪 **Testing the Flow**

### **Local Development**

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Navigate to login page**:
   ```
   http://localhost:3000/login
   ```

3. **Click "Forgot password?"**

4. **Enter a valid test email** (must be registered in Firebase):
   ```
   testuser@example.com
   ```

5. **Check email** for password reset link
   - If using Firebase test environment, find link in Firebase Console → Authentication → Templates

6. **Click the reset link** in email

7. **Enter and confirm new password**:
   - Example: `NewPassword123`
   - Must meet all requirements

8. **Verify redirect** to login page with success message

9. **Sign in** with new password

### **Production Testing**

Same steps as above, but use:
```
https://penny-amber.vercel.app/login
```

---

## 🔧 **Configuration**

### **Firebase Console Setup**

1. **Navigate to**: Firebase Console → Authentication → Templates

2. **Configure Email Template**:
   - Template type: **Password reset**
   - **Subject**: Reset your Penny password
   - **Sender name**: Penny AI
   - **From email**: noreply@penny-amber.vercel.app (or custom domain)

3. **Set Action URL** (Optional):
   ```
   https://penny-amber.vercel.app/reset-password
   ```

4. **Email Appearance**:
   - Customize branding
   - Add logo
   - Match Penny's color scheme

### **Environment Variables**

Already configured in `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```

No additional variables needed for password reset!

---

## 📁 **File Structure**

```
src/app/
├── forgot-password/
│   └── page.tsx              # Email submission page
├── reset-password/
│   └── page.tsx              # Password reset with token verification
└── login/
    └── page.tsx              # Updated with "Forgot password?" link

src/middleware.ts             # Updated to allow public access
```

---

## 🎯 **Key Implementation Details**

### **Firebase Methods Used**

```typescript
// Send password reset email
await sendPasswordResetEmail(auth, email, {
  url: `${window.location.origin}/login`,
  handleCodeInApp: true,
});

// Verify reset code
const email = await verifyPasswordResetCode(auth, oobCode);

// Confirm password reset
await confirmPasswordReset(auth, oobCode, newPassword);
```

### **URL Parameters**

| Parameter | Page | Purpose |
|-----------|------|---------|
| `oobCode` | `/reset-password` | Firebase-generated reset token |
| `email` | `/login` | Pre-fill email after reset |
| `reset` | `/login` | Show success message |

### **Error Handling**

```typescript
switch (errorCode) {
  case "auth/expired-action-code":
    // Token expired (> 1 hour)
    
  case "auth/invalid-action-code":
    // Token invalid or already used
    
  case "auth/user-not-found":
    // Email not registered
    
  case "auth/too-many-requests":
    // Rate limit exceeded
    
  case "auth/weak-password":
    // Password doesn't meet requirements
}
```

---

## 🚨 **Common Issues & Solutions**

### **"Reset link expired"**
- **Cause**: More than 1 hour passed since email was sent
- **Solution**: Request new reset link

### **"Reset link invalid"**
- **Cause**: Link already used or tampered with
- **Solution**: Request new reset link

### **"Email not found"**
- **Cause**: Email not registered in Firebase
- **Solution**: User needs to sign up first
- **Note**: We show generic success message to prevent account enumeration

### **"Password too weak"**
- **Cause**: Doesn't meet requirements
- **Solution**: Follow on-screen validation feedback

### **Email not received**
- Check spam/junk folder
- Verify email is registered
- Check Firebase quota limits
- Verify Firebase email templates are published

---

## 🔐 **Security Best Practices**

### **What We Do**
✅ Use Firebase's secure token generation  
✅ Enforce strong password requirements  
✅ Show generic messages (prevent enumeration)  
✅ Implement HTTPS only  
✅ Use single-use tokens  
✅ Set reasonable expiration (1 hour)  
✅ Rate limit reset requests  

### **What We Don't Do**
❌ Store passwords in plain text  
❌ Email passwords to users  
❌ Allow password reset without email verification  
❌ Reveal which emails are registered  
❌ Allow token reuse  

---

## 📊 **Analytics & Monitoring**

Track these events to monitor password reset flow:
- Reset email requests
- Successful password resets
- Failed verification attempts
- Expired token usage
- Time from email to reset completion

---

## 🎨 **Customization Guide**

### **Change Password Requirements**

Edit `/src/app/reset-password/page.tsx`:

```typescript
const validatePassword = (password: string): string[] => {
  const errors: string[] = [];
  // Add/modify requirements here
  if (password.length < 10) { // Change from 8 to 10
    errors.push("Password must be at least 10 characters");
  }
  // Add special character requirement
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push("Password must contain a special character");
  }
  return errors;
};
```

### **Change Token Expiration**

This is configured in Firebase Console → Authentication → Settings.

### **Customize Email Template**

Firebase Console → Authentication → Templates → Password reset

---

## 📝 **Future Enhancements**

Potential improvements for the future:
- [ ] Custom branded email templates
- [ ] SMS-based password reset option
- [ ] Two-factor authentication integration
- [ ] Password strength meter visualization
- [ ] Reset attempt analytics dashboard
- [ ] Localization (multiple languages)
- [ ] Account recovery options

---

## 🆘 **Support**

If users encounter issues:
1. Check Firebase Console logs
2. Verify email templates are published
3. Check Firebase quota limits
4. Review Vercel deployment logs
5. Test with different email providers

---

## ✅ **Checklist for Deployment**

Before deploying password reset to production:

- [x] Firebase email templates configured
- [x] Action URL points to production domain
- [x] SMTP settings verified in Firebase
- [x] Public routes added to middleware
- [x] Error handling implemented
- [x] Success states tested
- [x] Mobile responsiveness verified
- [x] Dark mode compatibility checked
- [x] Password validation tested
- [x] Token expiration tested
- [x] Email delivery tested
- [x] Auto-redirect timing verified

---

**Status**: ✅ Deployed and working on production!

**Last Updated**: 2025-11-11

