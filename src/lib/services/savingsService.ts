import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  PersonalSavingsGoal,
  GroupSavingsGoal,
  SavingsContribution,
  CreatePersonalSavingsGoal,
  CreateGroupSavingsGoal,
  UpdatePersonalSavingsGoal,
  UpdateGroupSavingsGoal,
  CreateSavingsContribution,
  GoalStatus,
  SavingsCategory,
} from '../types/savings';
import {
  calculateProgressPercentage,
  calculateMonthsToGoal,
} from '../utils/savingsCalculations';

const PERSONAL_SAVINGS_COLLECTION = 'savings_goals_personal';
const GROUP_SAVINGS_COLLECTION = 'savings_goals_group';
const CONTRIBUTIONS_COLLECTION = 'savings_contributions';

/**
 * Personal Savings Goals Service
 */
export const PersonalSavingsGoalService = {
  /**
   * Create a new personal savings goal
   */
  async create(
    data: CreatePersonalSavingsGoal
  ): Promise<PersonalSavingsGoal> {
    const now = Timestamp.now();

    // Calculate initial progress
    const progressPercentage = calculateProgressPercentage(
      data.currentAmount,
      data.targetAmount
    );
    const monthsToGoal = calculateMonthsToGoal(
      data.currentAmount,
      data.targetAmount,
      data.monthlyContribution
    );

    const goalData = {
      ...data,
      progressPercentage,
      monthsToGoal,
      onTrack: true, // Assume on track when first created
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(
      collection(db, PERSONAL_SAVINGS_COLLECTION),
      goalData
    );

    return {
      id: docRef.id,
      ...goalData,
    } as PersonalSavingsGoal;
  },

  /**
   * Get a specific savings goal by ID
   */
  async getById(goalId: string): Promise<PersonalSavingsGoal | null> {
    const docRef = doc(db, PERSONAL_SAVINGS_COLLECTION, goalId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as PersonalSavingsGoal;
  },

  /**
   * Get all savings goals for a user
   */
  async getAllForUser(
    userId: string,
    includeInactive: boolean = false
  ): Promise<PersonalSavingsGoal[]> {
    let q = query(
      collection(db, PERSONAL_SAVINGS_COLLECTION),
      where('userId', '==', userId),
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );

    if (!includeInactive) {
      q = query(
        collection(db, PERSONAL_SAVINGS_COLLECTION),
        where('userId', '==', userId),
        where('isActive', '==', true),
        orderBy('priority', 'asc'),
        orderBy('createdAt', 'desc')
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as PersonalSavingsGoal)
    );
  },

  /**
   * Get active savings goals for a user
   */
  async getActiveForUser(userId: string): Promise<PersonalSavingsGoal[]> {
    const q = query(
      collection(db, PERSONAL_SAVINGS_COLLECTION),
      where('userId', '==', userId),
      where('isActive', '==', true),
      where('status', '==', GoalStatus.ACTIVE)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as PersonalSavingsGoal)
    );
  },

  /**
   * Update a savings goal
   */
  async update(
    goalId: string,
    data: UpdatePersonalSavingsGoal
  ): Promise<void> {
    const docRef = doc(db, PERSONAL_SAVINGS_COLLECTION, goalId);

    // Recalculate progress if amounts changed
    const updates: any = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    if (
      data.currentAmount !== undefined ||
      data.targetAmount !== undefined ||
      data.monthlyContribution !== undefined
    ) {
      const goal = await this.getById(goalId);
      if (goal) {
        const currentAmount = data.currentAmount ?? goal.currentAmount;
        const targetAmount = data.targetAmount ?? goal.targetAmount;
        const monthlyContribution =
          data.monthlyContribution ?? goal.monthlyContribution;

        updates.progressPercentage = calculateProgressPercentage(
          currentAmount,
          targetAmount
        );
        updates.monthsToGoal = calculateMonthsToGoal(
          currentAmount,
          targetAmount,
          monthlyContribution
        );

        // Check if goal is achieved
        if (currentAmount >= targetAmount && goal.status === GoalStatus.ACTIVE) {
          updates.status = GoalStatus.ACHIEVED;
          updates.achievedDate = Timestamp.now();
          updates.isActive = false;
        }
      }
    }

    await updateDoc(docRef, updates);
  },

  /**
   * Delete a savings goal
   */
  async delete(goalId: string): Promise<void> {
    const docRef = doc(db, PERSONAL_SAVINGS_COLLECTION, goalId);
    await deleteDoc(docRef);
  },

  /**
   * Add contribution to a goal (update currentAmount)
   */
  async addContribution(goalId: string, amount: number): Promise<void> {
    const goal = await this.getById(goalId);
    if (!goal) throw new Error('Goal not found');

    const newCurrentAmount = goal.currentAmount + amount;

    await this.update(goalId, {
      currentAmount: newCurrentAmount,
      lastContributionAt: Timestamp.now(),
    });
  },

  /**
   * Pause a savings goal
   */
  async pause(goalId: string): Promise<void> {
    await this.update(goalId, {
      status: GoalStatus.PAUSED,
      isActive: false,
    });
  },

  /**
   * Resume a savings goal
   */
  async resume(goalId: string): Promise<void> {
    await this.update(goalId, {
      status: GoalStatus.ACTIVE,
      isActive: true,
    });
  },

  /**
   * Cancel a savings goal
   */
  async cancel(goalId: string): Promise<void> {
    await this.update(goalId, {
      status: GoalStatus.CANCELLED,
      isActive: false,
    });
  },

  /**
   * Mark goal as achieved
   */
  async markAchieved(goalId: string): Promise<void> {
    await this.update(goalId, {
      status: GoalStatus.ACHIEVED,
      achievedDate: Timestamp.now(),
      isActive: false,
    });
  },

  /**
   * Get goals by category
   */
  async getByCategory(
    userId: string,
    category: SavingsCategory
  ): Promise<PersonalSavingsGoal[]> {
    const q = query(
      collection(db, PERSONAL_SAVINGS_COLLECTION),
      where('userId', '==', userId),
      where('category', '==', category),
      where('isActive', '==', true)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as PersonalSavingsGoal)
    );
  },

  /**
   * Calculate total monthly savings allocation for a user
   */
  async calculateTotalMonthlyAllocation(userId: string): Promise<number> {
    const goals = await this.getActiveForUser(userId);
    return goals.reduce((total, goal) => total + goal.monthlyContribution, 0);
  },
};

/**
 * Group Savings Goals Service
 */
export const GroupSavingsGoalService = {
  /**
   * Create a new group savings goal
   */
  async create(data: CreateGroupSavingsGoal): Promise<GroupSavingsGoal> {
    const now = Timestamp.now();

    const progressPercentage = calculateProgressPercentage(
      data.currentAmount,
      data.targetAmount
    );
    const monthsToGoal = calculateMonthsToGoal(
      data.currentAmount,
      data.targetAmount,
      data.monthlyContribution
    );

    const goalData = {
      ...data,
      progressPercentage,
      monthsToGoal,
      onTrack: true,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(
      collection(db, GROUP_SAVINGS_COLLECTION),
      goalData
    );

    return {
      id: docRef.id,
      ...goalData,
    } as GroupSavingsGoal;
  },

  /**
   * Get a specific group savings goal by ID
   */
  async getById(goalId: string): Promise<GroupSavingsGoal | null> {
    const docRef = doc(db, GROUP_SAVINGS_COLLECTION, goalId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as GroupSavingsGoal;
  },

  /**
   * Get all savings goals for a group
   */
  async getAllForGroup(
    groupId: string,
    includeInactive: boolean = false
  ): Promise<GroupSavingsGoal[]> {
    let q = query(
      collection(db, GROUP_SAVINGS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );

    if (!includeInactive) {
      q = query(
        collection(db, GROUP_SAVINGS_COLLECTION),
        where('groupId', '==', groupId),
        where('isActive', '==', true),
        orderBy('priority', 'asc'),
        orderBy('createdAt', 'desc')
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as GroupSavingsGoal)
    );
  },

  /**
   * Get active savings goals for a group
   */
  async getActiveForGroup(groupId: string): Promise<GroupSavingsGoal[]> {
    const q = query(
      collection(db, GROUP_SAVINGS_COLLECTION),
      where('groupId', '==', groupId),
      where('isActive', '==', true),
      where('status', '==', GoalStatus.ACTIVE)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as GroupSavingsGoal)
    );
  },

  /**
   * Update a group savings goal
   */
  async update(
    goalId: string,
    data: UpdateGroupSavingsGoal
  ): Promise<void> {
    const docRef = doc(db, GROUP_SAVINGS_COLLECTION, goalId);

    const updates: any = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    if (
      data.currentAmount !== undefined ||
      data.targetAmount !== undefined ||
      data.monthlyContribution !== undefined
    ) {
      const goal = await this.getById(goalId);
      if (goal) {
        const currentAmount = data.currentAmount ?? goal.currentAmount;
        const targetAmount = data.targetAmount ?? goal.targetAmount;
        const monthlyContribution =
          data.monthlyContribution ?? goal.monthlyContribution;

        updates.progressPercentage = calculateProgressPercentage(
          currentAmount,
          targetAmount
        );
        updates.monthsToGoal = calculateMonthsToGoal(
          currentAmount,
          targetAmount,
          monthlyContribution
        );

        if (currentAmount >= targetAmount && goal.status === GoalStatus.ACTIVE) {
          updates.status = GoalStatus.ACHIEVED;
          updates.achievedDate = Timestamp.now();
          updates.isActive = false;
        }
      }
    }

    await updateDoc(docRef, updates);
  },

  /**
   * Delete a group savings goal
   */
  async delete(goalId: string): Promise<void> {
    const docRef = doc(db, GROUP_SAVINGS_COLLECTION, goalId);
    await deleteDoc(docRef);
  },

  /**
   * Add contribution to a group goal
   */
  async addContribution(goalId: string, amount: number, userId: string): Promise<void> {
    const goal = await this.getById(goalId);
    if (!goal) throw new Error('Goal not found');

    const newCurrentAmount = goal.currentAmount + amount;

    // Update user's contribution in the array
    const updatedContributions = [...goal.contributions];
    const userContribution = updatedContributions.find((c) => c.userId === userId);

    if (userContribution) {
      userContribution.totalContributed += amount;
    }

    await this.update(goalId, {
      currentAmount: newCurrentAmount,
      contributions: updatedContributions,
      lastContributionAt: Timestamp.now(),
    });
  },

  /**
   * Calculate total monthly savings allocation for a group
   */
  async calculateTotalMonthlyAllocation(groupId: string): Promise<number> {
    const goals = await this.getActiveForGroup(groupId);
    return goals.reduce((total, goal) => total + goal.monthlyContribution, 0);
  },
};

/**
 * Savings Contributions Service
 */
export const SavingsContributionService = {
  /**
   * Record a new contribution
   */
  async create(
    data: CreateSavingsContribution
  ): Promise<SavingsContribution> {
    const contributionData = {
      ...data,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(
      collection(db, CONTRIBUTIONS_COLLECTION),
      contributionData
    );

    // Update the goal's current amount
    if (data.userId) {
      await PersonalSavingsGoalService.addContribution(
        data.goalId,
        data.amount
      );
    } else if (data.groupId) {
      // For group contributions, we need to know which user contributed
      // This would be passed in the data or determined by context
      await GroupSavingsGoalService.addContribution(
        data.goalId,
        data.amount,
        data.userId || '' // In real implementation, get from auth context
      );
    }

    return {
      id: docRef.id,
      ...contributionData,
    } as SavingsContribution;
  },

  /**
   * Get contributions for a specific goal
   */
  async getForGoal(goalId: string): Promise<SavingsContribution[]> {
    const q = query(
      collection(db, CONTRIBUTIONS_COLLECTION),
      where('goalId', '==', goalId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as SavingsContribution)
    );
  },

  /**
   * Get contributions for a user's goals
   */
  async getForUser(userId: string): Promise<SavingsContribution[]> {
    const q = query(
      collection(db, CONTRIBUTIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as SavingsContribution)
    );
  },

  /**
   * Get contributions for a specific month
   */
  async getForMonth(
    userId: string | undefined,
    groupId: string | undefined,
    month: number,
    year: number
  ): Promise<SavingsContribution[]> {
    const constraints = [
      where('period.month', '==', month),
      where('period.year', '==', year),
      orderBy('date', 'desc'),
    ];

    if (userId) {
      constraints.unshift(where('userId', '==', userId));
    } else if (groupId) {
      constraints.unshift(where('groupId', '==', groupId));
    }

    const q = query(collection(db, CONTRIBUTIONS_COLLECTION), ...constraints);

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as SavingsContribution)
    );
  },

  /**
   * Delete a contribution
   */
  async delete(contributionId: string): Promise<void> {
    // Note: In a real implementation, you'd also need to update
    // the goal's currentAmount when deleting a contribution
    const docRef = doc(db, CONTRIBUTIONS_COLLECTION, contributionId);
    await deleteDoc(docRef);
  },
};

