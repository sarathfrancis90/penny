import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PersonalSavingsGoalService } from '@/lib/services/savingsService';
import { Timestamp } from 'firebase/firestore';

/**
 * GET /api/savings-goals/[goalId]
 * Get a specific savings goal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const goal = await PersonalSavingsGoalService.getById(params.goalId);

    if (!goal) {
      return NextResponse.json(
        { error: 'Savings goal not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (goal.userId !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('Error fetching savings goal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch savings goal' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/savings-goals/[goalId]
 * Update a savings goal
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const existing = await PersonalSavingsGoalService.getById(params.goalId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Savings goal not found' },
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
    if (body.targetAmount !== undefined)
      updateData.targetAmount = parseFloat(body.targetAmount);
    if (body.currentAmount !== undefined)
      updateData.currentAmount = parseFloat(body.currentAmount);
    if (body.monthlyContribution !== undefined)
      updateData.monthlyContribution = parseFloat(body.monthlyContribution);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.emoji !== undefined) updateData.emoji = body.emoji;

    if (body.targetDate !== undefined && body.targetDate !== null) {
      updateData.targetDate = Timestamp.fromDate(new Date(body.targetDate));
    }

    await PersonalSavingsGoalService.update(params.goalId, updateData);

    const updated = await PersonalSavingsGoalService.getById(params.goalId);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating savings goal:', error);
    return NextResponse.json(
      { error: 'Failed to update savings goal' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/savings-goals/[goalId]
 * Delete a savings goal
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const existing = await PersonalSavingsGoalService.getById(params.goalId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Savings goal not found' },
        { status: 404 }
      );
    }

    if (existing.userId !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await PersonalSavingsGoalService.delete(params.goalId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    return NextResponse.json(
      { error: 'Failed to delete savings goal' },
      { status: 500 }
    );
  }
}

