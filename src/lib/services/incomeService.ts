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
  PersonalIncomeSource,
  GroupIncomeSource,
  CreatePersonalIncomeSource,
  CreateGroupIncomeSource,
  UpdatePersonalIncomeSource,
  UpdateGroupIncomeSource,
  IncomeCategory,
} from '../types/income';
import { calculateMonthlyIncome } from '../utils/incomeCalculations';

const PERSONAL_INCOME_COLLECTION = 'income_sources_personal';
const GROUP_INCOME_COLLECTION = 'income_sources_group';

/**
 * Personal Income Service
 */
export const PersonalIncomeService = {
  /**
   * Create a new personal income source
   */
  async create(
    data: CreatePersonalIncomeSource
  ): Promise<PersonalIncomeSource> {
    const now = Timestamp.now();
    const incomeData = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(
      collection(db, PERSONAL_INCOME_COLLECTION),
      incomeData
    );

    return {
      id: docRef.id,
      ...incomeData,
    } as PersonalIncomeSource;
  },

  /**
   * Get a specific income source by ID
   */
  async getById(incomeId: string): Promise<PersonalIncomeSource | null> {
    const docRef = doc(db, PERSONAL_INCOME_COLLECTION, incomeId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as PersonalIncomeSource;
  },

  /**
   * Get all income sources for a user
   */
  async getAllForUser(
    userId: string,
    includeInactive: boolean = false
  ): Promise<PersonalIncomeSource[]> {
    let q = query(
      collection(db, PERSONAL_INCOME_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    if (!includeInactive) {
      q = query(
        collection(db, PERSONAL_INCOME_COLLECTION),
        where('userId', '==', userId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as PersonalIncomeSource)
    );
  },

  /**
   * Get active income sources for a user
   */
  async getActiveForUser(userId: string): Promise<PersonalIncomeSource[]> {
    return this.getAllForUser(userId, false);
  },

  /**
   * Update an income source
   */
  async update(
    incomeId: string,
    data: UpdatePersonalIncomeSource
  ): Promise<void> {
    const docRef = doc(db, PERSONAL_INCOME_COLLECTION, incomeId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Delete an income source
   */
  async delete(incomeId: string): Promise<void> {
    const docRef = doc(db, PERSONAL_INCOME_COLLECTION, incomeId);
    await deleteDoc(docRef);
  },

  /**
   * Deactivate an income source (soft delete)
   */
  async deactivate(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      isActive: false,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Reactivate an income source
   */
  async reactivate(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      isActive: true,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Calculate total monthly income for a user
   */
  async calculateTotalMonthlyIncome(userId: string): Promise<number> {
    const sources = await this.getActiveForUser(userId);
    return sources.reduce((total, source) => {
      return total + calculateMonthlyIncome(source.amount, source.frequency);
    }, 0);
  },

  /**
   * Get income sources by category
   */
  async getByCategory(
    userId: string,
    category: IncomeCategory
  ): Promise<PersonalIncomeSource[]> {
    const q = query(
      collection(db, PERSONAL_INCOME_COLLECTION),
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
        } as PersonalIncomeSource)
    );
  },

  /**
   * Record income received (update lastReceivedAt)
   */
  async recordReceived(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      lastReceivedAt: Timestamp.now(),
    });
  },
};

/**
 * Group Income Service
 */
export const GroupIncomeService = {
  /**
   * Create a new group income source
   */
  async create(data: CreateGroupIncomeSource): Promise<GroupIncomeSource> {
    const now = Timestamp.now();
    const incomeData = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(
      collection(db, GROUP_INCOME_COLLECTION),
      incomeData
    );

    return {
      id: docRef.id,
      ...incomeData,
    } as GroupIncomeSource;
  },

  /**
   * Get a specific group income source by ID
   */
  async getById(incomeId: string): Promise<GroupIncomeSource | null> {
    const docRef = doc(db, GROUP_INCOME_COLLECTION, incomeId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as GroupIncomeSource;
  },

  /**
   * Get all income sources for a group
   */
  async getAllForGroup(
    groupId: string,
    includeInactive: boolean = false
  ): Promise<GroupIncomeSource[]> {
    let q = query(
      collection(db, GROUP_INCOME_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );

    if (!includeInactive) {
      q = query(
        collection(db, GROUP_INCOME_COLLECTION),
        where('groupId', '==', groupId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as GroupIncomeSource)
    );
  },

  /**
   * Get active income sources for a group
   */
  async getActiveForGroup(groupId: string): Promise<GroupIncomeSource[]> {
    return this.getAllForGroup(groupId, false);
  },

  /**
   * Update a group income source
   */
  async update(
    incomeId: string,
    data: UpdateGroupIncomeSource
  ): Promise<void> {
    const docRef = doc(db, GROUP_INCOME_COLLECTION, incomeId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Delete a group income source
   */
  async delete(incomeId: string): Promise<void> {
    const docRef = doc(db, GROUP_INCOME_COLLECTION, incomeId);
    await deleteDoc(docRef);
  },

  /**
   * Deactivate a group income source
   */
  async deactivate(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      isActive: false,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Reactivate a group income source
   */
  async reactivate(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      isActive: true,
      updatedAt: Timestamp.now(),
    });
  },

  /**
   * Calculate total monthly income for a group
   */
  async calculateTotalMonthlyIncome(groupId: string): Promise<number> {
    const sources = await this.getActiveForGroup(groupId);
    return sources.reduce((total, source) => {
      return total + calculateMonthlyIncome(source.amount, source.frequency);
    }, 0);
  },

  /**
   * Get income sources added by a specific user
   */
  async getByUser(
    groupId: string,
    userId: string
  ): Promise<GroupIncomeSource[]> {
    const q = query(
      collection(db, GROUP_INCOME_COLLECTION),
      where('groupId', '==', groupId),
      where('addedBy', '==', userId),
      where('isActive', '==', true)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as GroupIncomeSource)
    );
  },

  /**
   * Record income received for a group
   */
  async recordReceived(incomeId: string): Promise<void> {
    await this.update(incomeId, {
      lastReceivedAt: Timestamp.now(),
    });
  },
};

/**
 * Batch operations for income sources
 */
export const IncomeBatchService = {
  /**
   * Copy income sources from previous month (for monthly setup)
   */
  async copyToNewMonth(
    userId: string,
    isGroup: boolean = false,
    groupId?: string
  ): Promise<void> {
    const batch = writeBatch(db);

    if (isGroup && groupId) {
      const sources = await GroupIncomeService.getActiveForGroup(groupId);
      // Group income typically doesn't auto-copy, admins manage it
      // This is here for future use if needed
    } else {
      const sources = await PersonalIncomeService.getActiveForUser(userId);
      // Personal recurring income continues automatically
      // No action needed as they're already marked as recurring
    }

    await batch.commit();
  },

  /**
   * Deactivate all income sources for a user
   */
  async deactivateAll(userId: string): Promise<void> {
    const sources = await PersonalIncomeService.getActiveForUser(userId);
    const batch = writeBatch(db);

    sources.forEach((source) => {
      const docRef = doc(db, PERSONAL_INCOME_COLLECTION, source.id);
      batch.update(docRef, {
        isActive: false,
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();
  },
};

