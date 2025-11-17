# Google Gemini API Setup for Penny

## Getting Your Gemini API Key

### Step 1: Access Google AI Studio

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Accept the terms of service if prompted

### Step 2: Create API Key

1. Click **"Get API key"** or **"Create API key"**
2. You can either:
   - Create a new project and generate a key
   - Use an existing Google Cloud project
3. **Copy the API key** (it will look like: `AIzaSyC...`)
4. **Important:** Store this key securely - you won't be able to see it again

### Step 3: Configure Environment Variable

1. Open `.env.local` in your Penny project root
2. Find the line: `GEMINI_API_KEY=your_gemini_api_key_here`
3. Replace `your_gemini_api_key_here` with your actual API key
4. Save the file

Example:
```env
GEMINI_API_KEY=AIzaSyC1234567890abcdefghijklmnopqrstuvwxyz
```

### Step 4: Restart Development Server

```bash
# Stop the current server (Ctrl+C if running)
npm run dev
```

## Testing the Integration

### Test with Text Input

1. Navigate to `http://localhost:3000`
2. Sign in with your account
3. Type a message like: "Lunch at Moxies for $85.50"
4. Press Send
5. Penny should analyze it and extract the expense details

### Test with Receipt Image

1. Click the image upload button
2. Select a receipt photo
3. Add optional text description
4. Press Send
5. Penny should analyze the receipt and extract vendor, amount, date, and category

## API Pricing & Limits

### Gemini 1.5 Flash (Used by Penny)

- **Free Tier:** 15 requests per minute (RPM)
- **Free Tier:** 1 million tokens per day
- **Cost (if exceeded):** Very affordable for personal use

### Tips for Staying in Free Tier

- The free tier is generous for personal expense tracking
- Each receipt analysis uses ~1,000-3,000 tokens
- You can track hundreds of expenses per day within the free tier
- Monitor your usage at [Google AI Studio](https://makersuite.google.com/app/apikey)

## How the API Works

### What Happens When You Submit an Expense

1. **User Input:** You type text and/or upload a receipt image
2. **API Route:** Penny sends the data to `/api/analyze-expense`
3. **Gemini Processing:** The API:
   - Constructs a detailed prompt with expense categories
   - Sends text/image to Gemini 1.5 Flash
   - Receives structured JSON response
4. **Validation:** The response is validated and cleaned:
   - Checks for required fields (vendor, amount, category)
   - Validates category against your predefined list
   - Ensures proper date format (YYYY-MM-DD)
   - Converts amount to number
5. **Response:** Returns structured expense data to the frontend

### Supported Input Formats

**Text Examples:**
- "Coffee at Starbucks $4.50"
- "Bought office supplies from Staples, $127.99"
- "Client lunch today, $85 at The Keg"
- "Gas $60"

**Image Types:**
- JPEG, PNG, WebP
- Photos of paper receipts
- Screenshots of digital receipts
- Email receipts (as images)

### Categories

Penny is pre-configured with 60+ Canadian tax expense categories including:
- Office supplies & equipment
- Professional services
- Home office expenses
- Vehicle expenses
- Travel & meals
- Technology & software
- And many more...

The AI automatically selects the most appropriate category based on your expense.

## Troubleshooting

### "AI service is not configured"
- Check that `GEMINI_API_KEY` is set in `.env.local`
- Restart your dev server after adding the key
- Ensure there are no extra spaces or quotes around the key

### "Failed to parse expense data"
- This is rare but can happen if the image is very unclear
- Try providing text description along with the image
- Ensure the image is a clear photo of the receipt

### "Invalid API key"
- Double-check your API key is correct
- Make sure you copied the entire key
- Verify the key is active in Google AI Studio

### Rate Limiting
- If you hit the free tier limit (15 RPM), wait a minute and try again
- For production use, consider upgrading to a paid plan

## Security Notes

- ✅ The API key is stored server-side in `.env.local`
- ✅ It's never exposed to the client/browser
- ✅ `.env.local` is in `.gitignore` and won't be committed
- ✅ API routes run server-side in Next.js serverless functions

## Next Steps

Once your Gemini API is configured and working:
1. Test with various receipt types
2. Try different expense descriptions
3. Move on to **Prompt 8** to save expenses to Firestore!

---

**Need help?** Check the [Google AI Studio documentation](https://ai.google.dev/docs)
