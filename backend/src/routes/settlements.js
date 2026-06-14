import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Record a payment / settlement
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { groupId, payerId, receiverId, amount } = req.body;

    if (!groupId || !payerId || !receiverId || amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Missing or invalid parameters' });
    }

    // Verify requester is part of group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this group' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        receiverId,
        amount: Math.round(amount * 100) / 100
      },
      include: {
        payer: { select: { id: true, name: true, avatarUrl: true } },
        receiver: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    return res.status(201).json(settlement);
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Revert/Delete a settlement
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const settlementId = req.params.id;

    const settlement = await prisma.settlement.findUnique({
      where: { id: settlementId }
    });

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement record not found' });
    }

    // Verify requester is in the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: settlement.groupId, userId: req.user.id }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.settlement.delete({
      where: { id: settlementId }
    });

    return res.json({ message: 'Settlement deleted successfully' });
  } catch (error) {
    console.error('Delete settlement error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
