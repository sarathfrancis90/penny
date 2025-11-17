import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PersonalIncomeService } from '@/lib/services/incomeService';
import { Timestamp } from 'firebase/firestore';

/**
 * GET /api/income/[incomeId]
 * Get a specific income source
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { incomeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const income = await PersonalIncomeService.getById(params.incomeId);

    if (!income) {
      return NextResponse.json(
        { error: 'Income source not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (income.userId !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: income });
  } catch (error) {
    console.error('Error fetching income source:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income source' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/income/[incomeId]
 * Update an income source
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { incomeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const existing = await PersonalIncomeService.getById(params.incomeId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Income source not found' },
        { status: 404 }
      );
    }

    if (existing.userId !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    // Only update fields that are provided
    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.isRecurring !== undefined)
      updateData.isRecurring = body.isRecurring;
    if (body.recurringDate !== undefined)
      updateData.recurringDate = body.recurringDate;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.taxable !== undefined) updateData.taxable = body.taxable;
    if (body.netAmount !== undefined)
      updateData.netAmount = parseFloat(body.netAmount);

    if (body.startDate !== undefined) {
      updateData.startDate = Timestamp.fromDate(new Date(body.startDate));
    }
    if (body.endDate !== undefined && body.endDate !== null) {
      updateData.endDate = Timestamp.fromDate(new Date(body.endDate));
    }

    await PersonalIncomeService.update(params.incomeId, updateData);

    const updated = await PersonalIncomeService.getById(params.incomeId);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating income source:', error);
    return NextResponse.json(
      { error: 'Failed to update income source' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/income/[incomeId]
 * Delete an income source
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { incomeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const existing = await PersonalIncomeService.getById(params.incomeId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Income source not found' },
        { status: 404 }
      );
    }

    if (existing.userId !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await PersonalIncomeService.delete(params.incomeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting income source:', error);
    return NextResponse.json(
      { error: 'Failed to delete income source' },
      { status: 500 }
    );
  }
}

