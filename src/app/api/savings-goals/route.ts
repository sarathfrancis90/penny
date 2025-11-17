import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PersonalSavingsGoalService } from '@/lib/services/savingsService';
import { CreatePersonalSavingsGoal, GoalStatus } from '@/lib/types/savings';
import { Timestamp } from 'firebase/firestore';

/**
 * GET /api/savings-goals
 * Get all savings goals for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let savingsGoals;
    if (activeOnly) {
      savingsGoals = await PersonalSavingsGoalService.getActiveForUser(
        session.user.email
      );
    } else {
      savingsGoals = await PersonalSavingsGoalService.getAllForUser(
        session.user.email,
        includeInactive
      );
    }

    return NextResponse.json({ success: true, data: savingsGoals });
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch savings goals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/savings-goals
 * Create a new savings goal
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.category || !body.targetAmount || !body.monthlyContribution) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const goalData: CreatePersonalSavingsGoal = {
      userId: session.user.email,
      name: body.name,
      category: body.category,
      targetAmount: parseFloat(body.targetAmount),
      currentAmount: body.currentAmount ? parseFloat(body.currentAmount) : 0,
      monthlyContribution: parseFloat(body.monthlyContribution),
      targetDate: body.targetDate
        ? Timestamp.fromDate(new Date(body.targetDate))
        : undefined,
      startDate: body.startDate
        ? Timestamp.fromDate(new Date(body.startDate))
        : Timestamp.now(),
      status: body.status || GoalStatus.ACTIVE,
      isActive: body.isActive ?? true,
      priority: body.priority || 'medium',
      description: body.description,
      emoji: body.emoji,
      currency: body.currency || 'USD',
    };

    const newGoal = await PersonalSavingsGoalService.create(goalData);

    return NextResponse.json(
      { success: true, data: newGoal },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating savings goal:', error);
    return NextResponse.json(
      { error: 'Failed to create savings goal' },
      { status: 500 }
    );
  }
}

