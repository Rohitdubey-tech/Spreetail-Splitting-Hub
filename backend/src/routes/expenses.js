import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

const round2 = (num) => Math.round(num * 100) / 100;

const processSplits = (splitType, totalAmount, splitsInput) => {
  if (splitsInput.length === 0) {
    throw new Error('Expense must be split with at least one person');
  }

  const processed = [];

  switch (splitType) {
    case 'EQUAL': {
      const share = round2(totalAmount / splitsInput.length);
      let runningSum = 0;
      
      for (let i = 0; i < splitsInput.length - 1; i++) {
        processed.push({
          userId: splitsInput[i].userId,
          amount: share
        });
        runningSum += share;
      }
      
      const lastShare = round2(totalAmount - runningSum);
      processed.push({
        userId: splitsInput[splitsInput.length - 1].userId,
        amount: lastShare
      });
      break;
    }
    
    case 'UNEQUAL': {
      let sum = 0;
      for (const split of splitsInput) {
        if (split.amount === undefined || split.amount < 0) {
          throw new Error('Invalid split amount specified');
        }
        const amt = round2(split.amount);
        processed.push({
          userId: split.userId,
          amount: amt
        });
        sum += amt;
      }
      
      if (Math.abs(sum - totalAmount) > 0.02) {
        throw new Error(`Sum of split amounts ($${sum}) must equal total expense amount ($${totalAmount})`);
      }
      break;
    }
    
    case 'PERCENTAGE': {
      let percentSum = 0;
      let amountSum = 0;
      
      for (let i = 0; i < splitsInput.length - 1; i++) {
        const split = splitsInput[i];
        if (split.percentage === undefined || split.percentage < 0) {
          throw new Error('Invalid split percentage specified');
        }
        const amt = round2(totalAmount * (split.percentage / 100));
        processed.push({
          userId: split.userId,
          amount: amt,
          percentage: split.percentage
        });
        percentSum += split.percentage;
        amountSum += amt;
      }
      
      const lastSplit = splitsInput[splitsInput.length - 1];
      if (lastSplit.percentage === undefined || lastSplit.percentage < 0) {
        throw new Error('Invalid split percentage specified');
      }
      percentSum += lastSplit.percentage;
      
      if (Math.abs(percentSum - 100) > 0.01) {
        throw new Error('Percentages must sum to exactly 100%');
      }
      
      const lastAmt = round2(totalAmount - amountSum);
      processed.push({
        userId: lastSplit.userId,
        amount: lastAmt,
        percentage: lastSplit.percentage
      });
      break;
    }
    
    case 'SHARE': {
      let totalShares = 0;
      for (const split of splitsInput) {
        if (split.shares === undefined || split.shares <= 0) {
          throw new Error('Shares must be positive numbers');
        }
        totalShares += split.shares;
      }
      
      let amountSum = 0;
      for (let i = 0; i < splitsInput.length - 1; i++) {
        const split = splitsInput[i];
        const amt = round2(totalAmount * (split.shares / totalShares));
        processed.push({
          userId: split.userId,
          amount: amt,
          shares: split.shares
        });
        amountSum += amt;
      }
      
      const lastSplit = splitsInput[splitsInput.length - 1];
      const lastAmt = round2(totalAmount - amountSum);
      processed.push({
        userId: lastSplit.userId,
        amount: lastAmt,
        shares: lastSplit.shares
      });
      break;
    }
    
    default:
      throw new Error('Unsupported split type');
  }

  return processed;
};

// Create Expense
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, title, totalAmount, paidById, splitType, splits } = req.body;

    if (!groupId || !title || !totalAmount || !paidById || !splitType || !splits) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this group' });
    }

    let processedSplits;
    try {
      processedSplits = processSplits(splitType, totalAmount, splits);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          title,
          totalAmount: round2(totalAmount),
          paidById,
          splitType
        }
      });

      const splitCreates = processedSplits.map(s => 
        tx.expenseSplit.create({
          data: {
            expenseId: expense.id,
            userId: s.userId,
            amount: s.amount,
            percentage: s.percentage,
            shares: s.shares
          }
        })
      );

      await Promise.all(splitCreates);

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          paidBy: { select: { id: true, name: true, avatarUrl: true } },
          splits: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } }
            }
          }
        }
      });
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Create expense error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Expense
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const { title, totalAmount, paidById, splitType, splits } = req.body;

    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: existingExpense.groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let processedSplits;
    try {
      processedSplits = processSplits(splitType, totalAmount, splits);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });

      const updatedExpense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          title,
          totalAmount: round2(totalAmount),
          paidById,
          splitType
        }
      });

      const splitCreates = processedSplits.map(s => 
        tx.expenseSplit.create({
          data: {
            expenseId: updatedExpense.id,
            userId: s.userId,
            amount: s.amount,
            percentage: s.percentage,
            shares: s.shares
          }
        })
      );

      await Promise.all(splitCreates);

      return tx.expense.findUnique({
        where: { id: expenseId },
        include: {
          paidBy: { select: { id: true, name: true, avatarUrl: true } },
          splits: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } }
            }
          }
        }
      });
    });

    return res.json(result);
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Expense
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const expenseId = req.params.id;

    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: existingExpense.groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.expense.delete({ where: { id: expenseId } });
    return res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat history for an expense
router.get('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const expenseId = req.params.id;

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: expense.groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { expenseId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.json(messages);
  } catch (error) {
    console.error('Get chat messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
