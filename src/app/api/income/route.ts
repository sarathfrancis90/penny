import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PersonalIncomeService } from '@/lib/services/incomeService';
import { CreatePersonalIncomeSource } from '@/lib/types/income';
import { Timestamp } from 'firebase/firestore';

/**
 * GET /api/income
 * Get all income sources for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const incomeSources = await PersonalIncomeService.getAllForUser(
      session.user.email,
      includeInactive
    );

    return NextResponse.json({ success: true, data: incomeSources });
  } catch (error) {
    console.error('Error fetching income sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income sources' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/income
 * Create a new income source
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.category || !body.amount || !body.frequency) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const incomeData: CreatePersonalIncomeSource = {
      userId: session.user.email,
      name: body.name,
      category: body.category,
      amount: parseFloat(body.amount),
      frequency: body.frequency,
      isRecurring: body.isRecurring ?? true,
      recurringDate: body.recurringDate,
      isActive: body.isActive ?? true,
      startDate: body.startDate
        ? Timestamp.fromDate(new Date(body.startDate))
        : Timestamp.now(),
      endDate: body.endDate
        ? Timestamp.fromDate(new Date(body.endDate))
        : undefined,
      description: body.description,
      taxable: body.taxable ?? true,
      netAmount: body.netAmount ? parseFloat(body.netAmount) : undefined,
      currency: body.currency || 'USD',
    };

    const newIncome = await PersonalIncomeService.create(incomeData);

    return NextResponse.json(
      { success: true, data: newIncome },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating income source:', error);
    return NextResponse.json(
      { error: 'Failed to create income source' },
      { status: 500 }
    );
  }
}

