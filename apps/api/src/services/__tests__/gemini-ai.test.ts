import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGeminiAiService } from '../gemini-ai';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.status = options.status;
    }
  },
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: mocks.generateContent,
      },
    };
  }),
  Type: {
    ARRAY: 'ARRAY',
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

describe('Gemini AI service', () => {
  it('normalizes top-level expense arrays returned from receipt analysis', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          vendor: 'Milton Sobeys',
          amount: '6.29',
          date: '2026-06-18',
          category: 'Groceries',
          description: 'Potato chips',
          confidence: 0.91,
        },
        {
          vendor: 'Milton Sobeys',
          amount: '33.25',
          date: '2026-06-18',
          category: 'Groceries',
          description: 'Produce and bakery',
          confidence: 0.89,
        },
      ]),
    });

    const service = createGeminiAiService('test-key');

    await expect(
      service.analyzeExpense({
        userId: 'user-1',
        imageBase64: 'base64-receipt',
      }),
    ).resolves.toEqual([
      {
        vendor: 'Milton Sobeys',
        amount: 6.29,
        date: '2026-06-18',
        category: 'Groceries',
        description: 'Potato chips',
        confidence: 0.91,
      },
      {
        vendor: 'Milton Sobeys',
        amount: 33.25,
        date: '2026-06-18',
        category: 'Groceries',
        description: 'Produce and bakery',
        confidence: 0.89,
      },
    ]);
  });

  it('uses a broad category schema to avoid enum rejection', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        expenses: [
          {
            vendor: 'Subway',
            amount: 12.5,
            date: '2026-06-06',
            category: 'Meals and entertainment',
          },
        ],
      }),
    });

    const service = createGeminiAiService('test-key');

    await service.analyzeExpense({
      userId: 'user-1',
      text: 'I spent $12.50 at Subway',
    });

    const call = mocks.generateContent.mock.calls.at(-1)?.[0];
    expect(call?.config?.responseSchema?.properties?.expenses?.items?.properties?.category).toEqual({
      type: 'STRING',
    });
    expect(call?.config?.responseSchema?.properties?.expenses?.items?.type).toBe('OBJECT');
    expect(call?.config?.responseSchema?.properties?.expenses?.minItems).toBe(1);
  });

  const oneExpense = {
    text: JSON.stringify({ expenses: [{ vendor: 'A', amount: 1, date: '2026-06-06', category: 'Groceries' }] }),
  };

  it('uses the low-latency model by default', async () => {
    mocks.generateContent.mockResolvedValueOnce(oneExpense);
    await createGeminiAiService('test-key').analyzeExpense({ userId: 'u', text: 'A $1' });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.model).toBe('gemini-3.5-flash-lite');
  });

  it('uses the configured model for receipts and chat, ignoring a blank override', async () => {
    const service = createGeminiAiService('test-key', { model: 'gemini-3.5-flash' });
    mocks.generateContent.mockResolvedValueOnce(oneExpense);
    await service.analyzeExpense({ userId: 'u', text: 'A $1' });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.model).toBe('gemini-3.5-flash');
    mocks.generateContent.mockResolvedValueOnce({ text: 'hi' });
    await service.chat({ userId: 'u', message: 'hello', conversationHistory: [] });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.model).toBe('gemini-3.5-flash');

    mocks.generateContent.mockResolvedValueOnce(oneExpense);
    await createGeminiAiService('test-key', { model: '  ' }).analyzeExpense({ userId: 'u', text: 'A $1' });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.model).toBe('gemini-3.5-flash-lite');
  });

  it('labels the receipt image with its real type', async () => {
    const service = createGeminiAiService('test-key');
    const sentImage = async (imageBase64: string) => {
      mocks.generateContent.mockResolvedValueOnce(oneExpense);
      await service.analyzeExpense({ userId: 'u', imageBase64 });
      const parts = mocks.generateContent.mock.calls.at(-1)?.[0]?.contents as Array<{
        inlineData?: { data: string; mimeType: string };
      }>;
      return parts.find((part) => part.inlineData)?.inlineData;
    };

    expect(await sentImage('/9j/4AAQSkZJRg')).toEqual({ data: '/9j/4AAQSkZJRg', mimeType: 'image/jpeg' });
    expect(await sentImage('iVBORw0KGgoAAAANS')).toEqual({ data: 'iVBORw0KGgoAAAANS', mimeType: 'image/png' });
    expect(await sentImage('data:image/png;base64,iVBORw0KGgoAAAANS')).toEqual({
      data: 'iVBORw0KGgoAAAANS',
      mimeType: 'image/png',
    });
    expect(await sentImage('data:image/heic;base64,AAAAGGZ0eXBoZWlj')).toEqual({
      data: 'AAAAGGZ0eXBoZWlj',
      mimeType: 'image/heic',
    });
    // A mislabelled data URL: trust the bytes, not the label.
    expect(await sentImage('data:image/jpeg;base64,UklGRlYAAABXRUJQ')).toEqual({
      data: 'UklGRlYAAABXRUJQ',
      mimeType: 'image/webp',
    });
    expect(await sentImage('unknown-bytes')).toEqual({ data: 'unknown-bytes', mimeType: 'image/jpeg' });
  });

  it('maps Gemini provider errors (e.g. depleted credits) to a 503 AI_UNAVAILABLE error', async () => {
    const { ApiError } = await import('@google/genai');
    mocks.generateContent.mockRejectedValueOnce(
      new ApiError({ message: 'Your prepayment credits are depleted', status: 402 }),
    );

    await expect(
      createGeminiAiService('test-key').analyzeExpense({ userId: 'u', imageBase64: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_UNAVAILABLE',
      upstreamStatus: 402,
      message: 'AI service is temporarily unavailable',
    });
  });

  it('maps Gemini provider errors in chat too', async () => {
    const { ApiError } = await import('@google/genai');
    mocks.generateContent.mockRejectedValueOnce(
      new ApiError({ message: 'quota', status: 429 }),
    );

    await expect(
      createGeminiAiService('test-key').chat({ userId: 'u', message: 'hi', conversationHistory: [] }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE', upstreamStatus: 429 });
  });

  it('leaves non-provider errors untouched', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('boom'));
    await expect(
      createGeminiAiService('test-key').analyzeExpense({ userId: 'u', text: 'x' }),
    ).rejects.toThrow('boom');
  });
});

describe('Gemini AI service robustness', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const expensesReply = (...expenses: Array<Record<string, unknown>>) => ({
    text: JSON.stringify({ expenses }),
  });
  const receipt = { vendor: 'Cafe', amount: 5, date: '2026-06-06', category: 'Groceries' };
  const analyze = (input: { text?: string; localDate?: string } = { text: 'x' }) =>
    createGeminiAiService('test-key').analyzeExpense({ userId: 'u', ...input });
  const unreadable = {
    statusCode: 422,
    code: 'AI_UNREADABLE',
    message: 'Could not read this receipt',
  };

  it('gives every Gemini request a 45 second timeout', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    createGeminiAiService('test-key');
    expect(vi.mocked(GoogleGenAI).mock.calls.at(-1)?.[0]).toEqual({
      apiKey: 'test-key',
      httpOptions: { timeout: 45_000 },
    });
  });

  it('reports a timed-out request as a retryable 503', async () => {
    mocks.generateContent.mockRejectedValueOnce(
      Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    );
    await expect(analyze()).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_UNAVAILABLE',
    });
  });

  it('maps a Gemini 400 to a non-retryable 422 and keeps other statuses as 503', async () => {
    const { ApiError } = await import('@google/genai');

    mocks.generateContent.mockRejectedValueOnce(
      new ApiError({ message: 'Unable to process input image', status: 400 }),
    );
    await expect(analyze()).rejects.toMatchObject({ ...unreadable, upstreamStatus: 400 });

    for (const status of [402, 403, 404, 408, 429, 500, 503]) {
      mocks.generateContent.mockRejectedValueOnce(new ApiError({ message: 'x', status }));
      await expect(analyze(), String(status)).rejects.toMatchObject({
        statusCode: 503,
        code: 'AI_UNAVAILABLE',
        upstreamStatus: status,
      });
    }

    mocks.generateContent.mockRejectedValueOnce(new ApiError({ message: 'blocked', status: 400 }));
    await expect(
      createGeminiAiService('test-key').chat({ userId: 'u', message: 'hi', conversationHistory: [] }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'AI_UNREADABLE' });
  });

  it('reports an empty or unparseable model reply as 422, not a 500', async () => {
    for (const text of [undefined, '', 'Sorry, I cannot read that.', '{"expenses": [', '42']) {
      mocks.generateContent.mockResolvedValueOnce({ text });
      await expect(analyze(), String(text)).rejects.toMatchObject(unreadable);
    }
  });

  it('parses formatted amount strings and rounds to cents', async () => {
    const amounts: Array<[unknown, number]> = [
      ['$1,234.56', 1234.56],
      ['1 234,56', 1234.56],
      ['12,50', 12.5],
      ['12,5', 12.5],
      ['1,234', 1234],
      ['1.234,56', 1234.56],
      ['CAD 45.00', 45],
      ['6.29', 6.29],
      [12.345, 12.35],
      [19.999, 20],
    ];
    mocks.generateContent.mockResolvedValueOnce(
      expensesReply(...amounts.map(([amount]) => ({ ...receipt, amount }))),
    );

    const result = await analyze();
    expect((result as Array<{ amount: number }>).map((expense) => expense.amount)).toEqual(
      amounts.map(([, expected]) => expected),
    );
  });

  it('drops expenses without a positive amount and fails when none are left', async () => {
    mocks.generateContent.mockResolvedValueOnce(
      expensesReply(
        { ...receipt, vendor: 'Zero', amount: 0 },
        { ...receipt, vendor: 'Negative', amount: '-5.00' },
        { ...receipt, vendor: 'Words', amount: 'free' },
        { ...receipt, vendor: 'Missing', amount: undefined },
        { ...receipt, vendor: 'Real', amount: '7.25' },
      ),
    );
    await expect(analyze()).resolves.toMatchObject({ vendor: 'Real', amount: 7.25 });

    mocks.generateContent.mockResolvedValueOnce(
      expensesReply({ ...receipt, vendor: '', amount: 0 }, { ...receipt, vendor: '  ', amount: 'n/a' }),
    );
    await expect(analyze()).rejects.toMatchObject(unreadable);
  });

  it('keeps a recognised vendor with amount 0 when no total could be read', async () => {
    mocks.generateContent.mockResolvedValueOnce(
      expensesReply({ ...receipt, vendor: 'Faded Cafe', amount: 'n/a' }, { ...receipt, vendor: 'Other', amount: 0 }),
    );
    await expect(analyze()).resolves.toMatchObject({ vendor: 'Faded Cafe', amount: 0 });
  });

  it('replaces impossible or far-future dates with the current local date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 02:30 UTC on July 1st is still June 30th for a user in Canada.
    vi.setSystemTime(new Date('2026-07-01T02:30:00Z'));

    const dates: Array<[unknown, string]> = [
      ['2026-06-15', '2026-06-15'],
      ['2026-07-01', '2026-07-01'], // tomorrow: allowed
      ['2026-07-02', '2026-06-30'], // more than a day ahead
      ['2026-02-31', '2026-06-30'],
      ['2026-13-01', '2026-06-30'],
      ['06/15/2026', '2026-06-30'],
      ['1999-06-15', '2026-06-30'],
      [undefined, '2026-06-30'],
    ];
    mocks.generateContent.mockResolvedValueOnce(
      expensesReply(...dates.map(([date]) => ({ ...receipt, date }))),
    );

    const result = await analyze();
    expect((result as Array<{ date: string }>).map((expense) => expense.date)).toEqual(
      dates.map(([, expected]) => expected),
    );
    const prompt = mocks.generateContent.mock.calls.at(-1)?.[0]?.contents?.[0]?.text;
    expect(prompt).toContain('Current date: 2026-06-30.');
  });

  it('prefers a plausible client localDate over the server default', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 06:30 UTC on July 1st: June 30th in Vancouver, July 1st in Toronto.
    vi.setSystemTime(new Date('2026-07-01T06:30:00Z'));

    mocks.generateContent.mockResolvedValueOnce(expensesReply({ ...receipt, date: undefined }));
    await expect(analyze({ text: 'x', localDate: '2026-06-30' })).resolves.toMatchObject({
      date: '2026-06-30',
    });
    expect(mocks.generateContent.mock.calls.at(-1)?.[0]?.contents?.[0]?.text).toContain(
      'Current date: 2026-06-30.',
    );

    // A localDate far from the server clock is ignored.
    mocks.generateContent.mockResolvedValueOnce(expensesReply({ ...receipt, date: undefined }));
    await expect(analyze({ text: 'x', localDate: '2031-01-01' })).resolves.toMatchObject({
      date: '2026-07-01',
    });
  });
});

describe('chat answers from the person’s own data', () => {
  const promptOf = () => mocks.generateContent.mock.calls.at(-1)?.[0]?.contents?.[0]?.text as string;

  it('puts the spending summary in the prompt and forbids invented figures', async () => {
    const spendingSummary = vi.fn(async () => 'June 2026: $112.50');
    mocks.generateContent.mockResolvedValueOnce({ text: 'You spent $112.50.' });
    const reply = await createGeminiAiService('test-key', { spendingSummary }).chat({
      userId: 'me',
      message: 'How much did I spend this month?',
      conversationHistory: [],
    });
    expect(reply).toBe('You spent $112.50.');
    expect(spendingSummary).toHaveBeenCalledWith('me');
    expect(promptOf()).toContain('--- USER DATA ---\nJune 2026: $112.50\n--- END USER DATA ---');
    expect(promptOf()).toContain('Never invent or estimate figures');
  });

  it('still answers, without making up numbers, when the summary cannot be loaded', async () => {
    const spendingSummary = vi.fn(async () => {
      throw new Error('firestore down');
    });
    mocks.generateContent.mockResolvedValueOnce({ text: 'ok' });
    await createGeminiAiService('test-key', { spendingSummary }).chat({
      userId: 'me',
      message: 'How much did I spend?',
      conversationHistory: [],
    });
    expect(promptOf()).not.toContain('USER DATA');
    expect(promptOf()).toContain("You cannot see this user's expenses");
  });
});
