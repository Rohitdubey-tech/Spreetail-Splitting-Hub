import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { calculateNetBalances, getDirectDebts, getSimplifiedDebts } from '../utils/balances.js';

const router = Router();
const prisma = new PrismaClient();

// Get all groups for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarUrl: true }
                }
              }
            }
          }
        }
      }
    });

    const groups = memberships.map(m => m.group);
    return res.json(groups);
  } catch (error) {
    console.error('Fetch groups error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, memberUserIds } = req.body;
    const creatorId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Combine creator and added members, ensuring uniqueness
    const userIds = Array.from(new Set([creatorId, ...(memberUserIds || [])]));

    const group = await prisma.group.create({
      data: {
        name,
        description,
        members: {
          create: userIds.map((userId) => ({
            userId
          }))
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        }
      }
    });

    return res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get group details by ID, including balance calculations
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        },
        expenses: {
          include: {
            paidBy: {
              select: { id: true, name: true, avatarUrl: true }
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, avatarUrl: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        settlements: {
          include: {
            payer: { select: { id: true, name: true, avatarUrl: true } },
            receiver: { select: { id: true, name: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Format members list for balance functions
    const membersList = group.members.map(m => m.user);

    // Format expenses list
    const formattedExpenses = group.expenses.map(e => ({
      id: e.id,
      totalAmount: e.totalAmount,
      paidById: e.paidById,
      splits: e.splits.map(s => ({
        userId: s.userId,
        amount: s.amount
      }))
    }));

    // Calculate balances
    const netBalances = calculateNetBalances(membersList, formattedExpenses, group.settlements);
    const directDebts = getDirectDebts(membersList, formattedExpenses, group.settlements);
    const simplifiedDebts = getSimplifiedDebts(membersList, netBalances);

    return res.json({
      group,
      balances: {
        netBalances,
        directDebts,
        simplifiedDebts
      }
    });
  } catch (error) {
    console.error('Fetch group details error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add members to a group (supports userIds or email + name invitation)
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { userIds, name, email } = req.body;

    // Verify requesting user is in group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: req.user.id }
      }
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // A. Invitation / Create placeholder user logic
    if (email && name) {
      let targetUser = await prisma.user.findUnique({ where: { email } });
      
      if (!targetUser) {
        const passwordHash = await bcrypt.hash('placeholder_pass_' + Math.random(), 10);
        targetUser = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash,
            avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
          }
        });
      }

      try {
        const member = await prisma.groupMember.create({
          data: { groupId, userId: targetUser.id },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        });
        return res.json({ message: 'Member invited successfully', newMembers: [member] });
      } catch (err) {
        return res.status(400).json({ error: 'User is already a member of this group' });
      }
    }

    // B. Default checklist logic
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array, or email and name, are required' });
    }

    const newMembers = [];
    for (const userId of userIds) {
      try {
        const member = await prisma.groupMember.create({
          data: { groupId, userId },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        });
        newMembers.push(member);
      } catch (err) {
        // Ignore duplicate memberships
      }
    }

    return res.json({ message: 'Members added successfully', newMembers });
  } catch (error) {
    console.error('Add members error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a member from group with balance verification
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const targetUserId = req.params.userId;
    const requesterId = req.user.id;

    // Check if requester is in group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: requesterId }
      }
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: { include: { user: true } },
        expenses: { include: { splits: true } },
        settlements: true
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const membersList = group.members.map(m => m.user);
    const formattedExpenses = group.expenses.map(e => ({
      id: e.id,
      totalAmount: e.totalAmount,
      paidById: e.paidById,
      splits: e.splits.map(s => ({
        userId: s.userId,
        amount: s.amount
      }))
    }));

    const netBalances = calculateNetBalances(membersList, formattedExpenses, group.settlements);
    const targetBalance = netBalances[targetUserId] || 0;

    if (Math.abs(targetBalance) > 0.01) {
      return res.status(400).json({
        error: `Cannot remove member with outstanding balances. User balance is ${targetBalance > 0 ? '+' : ''}${targetBalance.toFixed(2)}.`
      });
    }

    await prisma.groupMember.delete({
      where: {
        groupId_userId: { groupId, userId: targetUserId }
      }
    });

    return res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
